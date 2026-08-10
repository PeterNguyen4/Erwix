from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.models import Trade
from app.schemas import OrderLegOut, OrderRequest, OrderResponse
from app.services import execution_logger
from tests.conftest import make_user


@pytest.fixture()
def _use_test_db(monkeypatch, _pg_engine):
    """log_order_intent/_handle_trade_update/reconcile_recent_fills all open their
    own session via app.db.SessionLocal (bound to the real prod engine) rather than
    the get_db-overridden one — point that at the test Postgres container instead."""
    TestSessionLocal = async_sessionmaker(bind=_pg_engine, autoflush=False, expire_on_commit=False)
    monkeypatch.setattr(execution_logger, "SessionLocal", TestSessionLocal)


@pytest.mark.asyncio
async def test_log_order_intent_writes_simple_order(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    response = OrderResponse(
        id="broker-1",
        client_order_id="1:abc",
        symbol="AAPL",
        qty=10,
        side="buy",
        type="market",
        status="accepted",
        submitted_at=datetime.now(UTC),
    )
    request = OrderRequest(symbol="AAPL", qty=10, side="buy", type="market")

    await execution_logger.log_order_intent(response, request, user_id=1)

    trades = (await db_session.execute(select(Trade).where(Trade.user_id == 1))).scalars().all()
    assert len(trades) == 1
    assert trades[0].broker_order_id == "broker-1"
    assert trades[0].status == "accepted"


@pytest.mark.asyncio
async def test_log_order_intent_writes_bracket_legs_with_correct_leg_type(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    response = OrderResponse(
        id="broker-1",
        client_order_id="1:abc",
        symbol="AAPL",
        qty=10,
        side="buy",
        type="market",
        order_class="bracket",
        status="accepted",
        submitted_at=datetime.now(UTC),
        legs=[
            OrderLegOut(
                id="leg-tp",
                client_order_id="1:tp",
                side="sell",
                type="limit",
                limit_price=120.0,
            ),
            OrderLegOut(
                id="leg-sl",
                client_order_id="1:sl",
                side="sell",
                type="stop",
                stop_price=90.0,
            ),
        ],
    )
    request = OrderRequest(
        symbol="AAPL",
        qty=10,
        side="buy",
        type="market",
        order_class="bracket",
        take_profit_price=120.0,
        stop_loss_price=90.0,
    )

    await execution_logger.log_order_intent(response, request, user_id=1)

    trades = {
        t.broker_order_id: t
        for t in (await db_session.execute(select(Trade).where(Trade.user_id == 1))).scalars().all()
    }
    assert len(trades) == 3
    assert trades["leg-tp"].leg == "take_profit"
    assert trades["leg-sl"].leg == "stop_loss"
    assert trades["leg-tp"].parent_client_order_id == "1:abc"


@pytest.mark.asyncio
async def test_log_order_intent_swallows_errors_instead_of_raising(_use_test_db, db_session):
    # user_id=999 has no matching users row -> FK violation on insert; must not propagate.
    response = OrderResponse(
        id="broker-1",
        client_order_id="999:abc",
        symbol="AAPL",
        qty=10,
        side="buy",
        type="market",
        status="accepted",
        submitted_at=datetime.now(UTC),
    )
    request = OrderRequest(symbol="AAPL", qty=10, side="buy", type="market")

    await execution_logger.log_order_intent(response, request, user_id=999)  # must not raise


def _fake_order_event(
    event: str,
    *,
    order_id="broker-1",
    client_order_id="1:abc",
    symbol="AAPL",
    side="buy",
    filled_qty=10,
    filled_avg_price=100.0,
):
    order = SimpleNamespace(
        id=order_id,
        client_order_id=client_order_id,
        symbol=symbol,
        side=SimpleNamespace(value=side),
        order_type=SimpleNamespace(value="market"),
        status=SimpleNamespace(value="filled" if event in ("fill", "partial_fill") else event),
        filled_at=datetime.now(UTC),
        filled_qty=filled_qty,
        filled_avg_price=filled_avg_price,
    )
    return SimpleNamespace(event=event, order=order, price=filled_avg_price, qty=filled_qty)


@pytest.mark.asyncio
async def test_handle_trade_update_ignores_irrelevant_events(_use_test_db, db_session):
    data = SimpleNamespace(event="order_replace_rejected", order=SimpleNamespace(id="x"))
    await execution_logger._handle_trade_update(data)  # must not raise or write anything


@pytest.mark.asyncio
async def test_handle_trade_update_creates_fill_only_trade_when_no_intent_row_exists(
    _use_test_db, db_session
):
    db_session.add(make_user(1))
    await db_session.commit()

    with patch.object(execution_logger, "embed_trade_best_effort", new=AsyncMock()):
        await execution_logger._handle_trade_update(_fake_order_event("fill"))

    trades = (
        (await db_session.execute(select(Trade).where(Trade.broker_order_id == "broker-1")))
        .scalars()
        .all()
    )
    assert len(trades) == 1
    assert trades[0].status == "filled"
    assert trades[0].fill_price == 100.0


@pytest.mark.asyncio
async def test_handle_trade_update_updates_existing_intent_row_on_fill(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        Trade(
            user_id=1,
            broker_order_id="broker-1",
            client_order_id="1:abc",
            symbol="AAPL",
            side="buy",
            order_type="market",
            qty=10,
            fill_price=None,
            status="new",
        )
    )
    await db_session.commit()

    with patch.object(execution_logger, "embed_trade_best_effort", new=AsyncMock()) as mock_embed:
        await execution_logger._handle_trade_update(
            _fake_order_event("fill", filled_avg_price=105.5)
        )

    trade = (
        await db_session.execute(select(Trade).where(Trade.broker_order_id == "broker-1"))
    ).scalar_one()
    assert trade.status == "filled"
    assert trade.fill_price == 105.5
    mock_embed.assert_awaited_once()


@pytest.mark.asyncio
async def test_handle_trade_update_skips_non_fill_event_with_no_intent_row(
    _use_test_db, db_session
):
    db_session.add(make_user(1))
    await db_session.commit()

    await execution_logger._handle_trade_update(_fake_order_event("new"))

    trades = (
        (await db_session.execute(select(Trade).where(Trade.broker_order_id == "broker-1")))
        .scalars()
        .all()
    )
    assert trades == []


@pytest.mark.asyncio
async def test_reconcile_recent_fills_adds_unlogged_fills(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    fake_order = SimpleNamespace(
        id="broker-99",
        client_order_id="1:xyz",
        symbol="TSLA",
        side=SimpleNamespace(value="buy"),
        order_type=SimpleNamespace(value="market"),
        filled_qty=5,
        filled_avg_price=200.0,
        filled_at=datetime.now(UTC),
    )
    with patch.object(execution_logger, "get_recent_filled_orders", return_value=[fake_order]):
        await execution_logger.reconcile_recent_fills()

    trade = (
        await db_session.execute(select(Trade).where(Trade.broker_order_id == "broker-99"))
    ).scalar_one()
    assert trade.status == "filled"
    assert trade.fill_price == 200.0


@pytest.mark.asyncio
async def test_reconcile_recent_fills_updates_stale_intent_row(_use_test_db, db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        Trade(
            user_id=1,
            broker_order_id="broker-99",
            client_order_id="1:xyz",
            symbol="TSLA",
            side="buy",
            order_type="market",
            qty=5,
            fill_price=None,
            status="new",
        )
    )
    await db_session.commit()

    fake_order = SimpleNamespace(
        id="broker-99",
        client_order_id="1:xyz",
        symbol="TSLA",
        side=SimpleNamespace(value="buy"),
        order_type=SimpleNamespace(value="market"),
        filled_qty=5,
        filled_avg_price=200.0,
        filled_at=datetime.now(UTC),
    )
    with patch.object(execution_logger, "get_recent_filled_orders", return_value=[fake_order]):
        await execution_logger.reconcile_recent_fills()

    trade = (
        await db_session.execute(select(Trade).where(Trade.broker_order_id == "broker-99"))
    ).scalar_one()
    assert trade.status == "filled"
    assert trade.fill_price == 200.0


@pytest.mark.asyncio
async def test_reconcile_recent_fills_noop_when_nothing_returned(_use_test_db, db_session):
    with patch.object(execution_logger, "get_recent_filled_orders", return_value=[]):
        await execution_logger.reconcile_recent_fills()  # must not raise
