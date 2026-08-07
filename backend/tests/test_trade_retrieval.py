from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest

from app.services import trade_retrieval
from app.services.trade_retrieval import ClosedTrade, compute_pnl_summary_pair, compute_pnl_weekly_comparison


def _closed(pnl: float, closed_at: datetime) -> ClosedTrade:
    return ClosedTrade(
        symbol="AAPL", qty=10, entry_price=100.0, exit_price=100.0 + pnl / 10,
        pnl=pnl, opened_at=closed_at, closed_at=closed_at,
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
