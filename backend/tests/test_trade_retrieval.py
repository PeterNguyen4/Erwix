from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.models import Trade
from app.services import trade_retrieval
from tests.conftest import make_user
from app.services.trade_retrieval import (
    ClosedTrade,
    _fifo_match,
    compute_pnl_summary,
    compute_pnl_summary_pair,
    compute_pnl_weekly_comparison,
)


def _closed(pnl: float, closed_at: datetime) -> ClosedTrade:
    return ClosedTrade(
        symbol="AAPL", qty=10, entry_price=100.0, exit_price=100.0 + pnl / 10,
        pnl=pnl, opened_at=closed_at, closed_at=closed_at,
    )


def _fill(symbol: str, side: str, qty: float, price: float, minutes_ago: float, user_id: int = 1) -> Trade:
    return Trade(
        user_id=user_id,
        symbol=symbol,
        side=side,
        order_type="market",
        qty=qty,
        fill_price=price,
        fees=0.0,
        filled_at=datetime.now(timezone.utc) - timedelta(minutes=minutes_ago),
    )


@pytest.mark.asyncio
async def test_compute_pnl_summary_pair_splits_by_arbitrary_window():
    now = datetime.now(timezone.utc)
    closed = [
        _closed(100.0, now - timedelta(days=3)),  # falls in window A
        _closed(-50.0, now - timedelta(days=10)),  # falls in window B
    ]
    with patch.object(trade_retrieval, "_fifo_match_all", AsyncMock(return_value=closed)):
        a, b = await compute_pnl_summary_pair(
            db=None,
            user_id=1,
            window_a=(now - timedelta(days=7), now),
            window_b=(now - timedelta(days=14), now - timedelta(days=7)),
        )

    assert a.total_pnl == pytest.approx(100.0)
    assert a.win_count == 1
    assert b.total_pnl == pytest.approx(-50.0)
    assert b.loss_count == 1


@pytest.mark.asyncio
async def test_compute_pnl_weekly_comparison_delegates_to_pair():
    now = datetime.now(timezone.utc)
    closed = [_closed(100.0, now - timedelta(days=1))]
    with patch.object(trade_retrieval, "_fifo_match_all", AsyncMock(return_value=closed)):
        current, previous = await compute_pnl_weekly_comparison(db=None, user_id=1)

    assert current.total_pnl == pytest.approx(100.0)
    assert previous.total_pnl == 0.0


def test_fifo_match_simple_long_round_trip():
    trades = [
        _fill("AAPL", "buy", 10, 100.0, minutes_ago=10),
        _fill("AAPL", "sell", 10, 110.0, minutes_ago=5),
    ]
    closed = _fifo_match(trades)
    assert len(closed) == 1
    assert closed[0].qty == 10
    assert closed[0].entry_price == 100.0
    assert closed[0].exit_price == 110.0
    assert closed[0].pnl == pytest.approx(100.0)


def test_fifo_match_simple_short_round_trip():
    trades = [
        _fill("AAPL", "sell", 10, 100.0, minutes_ago=10),
        _fill("AAPL", "buy", 10, 90.0, minutes_ago=5),
    ]
    closed = _fifo_match(trades)
    assert len(closed) == 1
    # short: profits when covered below entry
    assert closed[0].pnl == pytest.approx(100.0)


def test_fifo_match_closing_fill_spans_multiple_open_lots_oldest_first():
    trades = [
        _fill("AAPL", "buy", 5, 100.0, minutes_ago=20),
        _fill("AAPL", "buy", 5, 120.0, minutes_ago=15),
        _fill("AAPL", "sell", 10, 130.0, minutes_ago=5),
    ]
    closed = _fifo_match(trades)
    assert len(closed) == 2
    # oldest lot (100.0) must be matched before the newer one (120.0)
    assert closed[0].entry_price == 100.0
    assert closed[0].qty == 5
    assert closed[0].pnl == pytest.approx((130.0 - 100.0) * 5)
    assert closed[1].entry_price == 120.0
    assert closed[1].qty == 5
    assert closed[1].pnl == pytest.approx((130.0 - 120.0) * 5)


def test_fifo_match_oversized_closing_fill_flips_to_new_open_lot():
    trades = [
        _fill("AAPL", "buy", 5, 100.0, minutes_ago=10),
        _fill("AAPL", "sell", 8, 110.0, minutes_ago=5),
    ]
    closed = _fifo_match(trades)
    # only 5 of the 8 sold close out the long lot
    assert len(closed) == 1
    assert closed[0].qty == 5
    assert closed[0].pnl == pytest.approx(50.0)


def test_fifo_match_leaves_unmatched_open_position_unclosed():
    trades = [_fill("AAPL", "buy", 10, 100.0, minutes_ago=5)]
    assert _fifo_match(trades) == []


def test_fifo_match_ignores_fills_missing_price_or_time():
    unfilled = _fill("AAPL", "buy", 10, 100.0, minutes_ago=5)
    unfilled.fill_price = None
    trades = [unfilled, _fill("AAPL", "sell", 10, 110.0, minutes_ago=1)]
    # the buy leg was dropped, so the sell has nothing to close against
    assert _fifo_match(trades) == []


def test_fifo_match_keeps_symbols_independent():
    trades = [
        _fill("AAPL", "buy", 10, 100.0, minutes_ago=10),
        _fill("AAPL", "sell", 10, 110.0, minutes_ago=5),
        _fill("MSFT", "buy", 10, 200.0, minutes_ago=8),
    ]
    closed = _fifo_match(trades)
    assert len(closed) == 1
    assert closed[0].symbol == "AAPL"


@pytest.mark.asyncio
async def test_compute_pnl_summary_only_counts_round_trips_closed_in_window(db_session):
    now = datetime.now(timezone.utc)
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add_all(
        [
            # closes 10 days ago -> outside a 7-day window
            _fill("AAPL", "buy", 10, 100.0, minutes_ago=15 * 24 * 60),
            _fill("AAPL", "sell", 10, 90.0, minutes_ago=10 * 24 * 60),
            # closes 1 day ago -> inside a 7-day window
            _fill("MSFT", "buy", 5, 200.0, minutes_ago=2 * 24 * 60),
            _fill("MSFT", "sell", 5, 220.0, minutes_ago=1 * 24 * 60),
        ]
    )
    await db_session.commit()

    summary = await compute_pnl_summary(db_session, user_id=1, start=now - timedelta(days=7), end=now)

    assert len(summary.closed_trades) == 1
    assert summary.closed_trades[0].symbol == "MSFT"
    assert summary.total_pnl == pytest.approx(100.0)
    assert summary.win_count == 1
    assert summary.loss_count == 0


@pytest.mark.asyncio
async def test_compute_pnl_summary_scopes_to_user(db_session):
    db_session.add(make_user(1))
    db_session.add(make_user(2))
    await db_session.commit()
    db_session.add_all(
        [
            _fill("AAPL", "buy", 10, 100.0, minutes_ago=10, user_id=1),
            _fill("AAPL", "sell", 10, 110.0, minutes_ago=5, user_id=1),
            _fill("AAPL", "buy", 10, 100.0, minutes_ago=10, user_id=2),
            _fill("AAPL", "sell", 10, 500.0, minutes_ago=5, user_id=2),
        ]
    )
    await db_session.commit()

    summary = await compute_pnl_summary(db_session, user_id=1)

    assert len(summary.closed_trades) == 1
    assert summary.total_pnl == pytest.approx(100.0)


def test_summarize_closed_win_rate_and_averages():
    from app.services.trade_retrieval import _summarize_closed

    now = datetime.now(timezone.utc)
    closed = [
        _closed(100.0, now),
        _closed(-40.0, now),
        _closed(0.0, now),
    ]
    summary = _summarize_closed(closed)

    assert summary.win_count == 1
    assert summary.loss_count == 1
    assert summary.breakeven_count == 1
    assert summary.win_rate == pytest.approx(0.5)
    assert summary.avg_win == pytest.approx(100.0)
    assert summary.avg_loss == pytest.approx(-40.0)
    assert summary.largest_win == pytest.approx(100.0)
    assert summary.largest_loss == pytest.approx(-40.0)


def test_summarize_closed_win_rate_none_when_no_decided_trades():
    from app.services.trade_retrieval import _summarize_closed

    summary = _summarize_closed([_closed(0.0, datetime.now(timezone.utc))])
    assert summary.win_rate is None
    assert summary.avg_win is None
    assert summary.avg_loss is None
