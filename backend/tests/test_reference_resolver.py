from datetime import date, datetime, timezone

import pytest

from app.models import JournalEntry, Trade
from app.schemas import AttachedReferenceIn
from app.services.reference_resolver import resolve_references
from tests.conftest import make_user


@pytest.mark.asyncio
async def test_resolve_trade_reference(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    trade = Trade(
        user_id=1, symbol="AAPL", side="buy", order_type="market", qty=10,
        fill_price=100.0, fees=0.0, filled_at=datetime.now(timezone.utc),
    )
    db_session.add(trade)
    await db_session.commit()
    await db_session.refresh(trade)

    resolved = await resolve_references(
        db_session, 1, [AttachedReferenceIn(type="trade", ref_id=str(trade.id))]
    )
    assert len(resolved) == 1
    assert "AAPL" in resolved[0]


@pytest.mark.asyncio
async def test_resolve_trade_reference_skips_other_users_trade(db_session):
    db_session.add(make_user(1))
    db_session.add(make_user(2))
    await db_session.commit()
    trade = Trade(
        user_id=2, symbol="AAPL", side="buy", order_type="market", qty=10,
        fill_price=100.0, fees=0.0, filled_at=datetime.now(timezone.utc),
    )
    db_session.add(trade)
    await db_session.commit()
    await db_session.refresh(trade)

    resolved = await resolve_references(
        db_session, 1, [AttachedReferenceIn(type="trade", ref_id=str(trade.id))]
    )
    assert resolved == []


@pytest.mark.asyncio
async def test_resolve_trade_reference_skips_nonexistent_id(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    resolved = await resolve_references(
        db_session, 1, [AttachedReferenceIn(type="trade", ref_id="99999")]
    )
    assert resolved == []


@pytest.mark.asyncio
async def test_resolve_trade_reference_skips_non_numeric_id(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    resolved = await resolve_references(
        db_session, 1, [AttachedReferenceIn(type="trade", ref_id="not-a-number")]
    )
    assert resolved == []


@pytest.mark.asyncio
async def test_resolve_journal_entry_reference(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    entry = JournalEntry(user_id=1, entry_date=date(2026, 1, 5), symbol="MSFT", notes="great setup")
    db_session.add(entry)
    await db_session.commit()
    await db_session.refresh(entry)

    resolved = await resolve_references(
        db_session, 1, [AttachedReferenceIn(type="journal_entry", ref_id=str(entry.id))]
    )
    assert len(resolved) == 1
    assert "MSFT" in resolved[0]
    assert "great setup" in resolved[0]


@pytest.mark.asyncio
async def test_resolve_day_reference_with_trades_and_entries(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    day = date(2026, 1, 5)
    db_session.add(Trade(
        user_id=1, symbol="AAPL", side="buy", order_type="market", qty=10,
        fill_price=100.0, fees=0.0, filled_at=datetime(2026, 1, 5, 15, 0, tzinfo=timezone.utc),
    ))
    db_session.add(JournalEntry(user_id=1, entry_date=day, notes="reviewed setup"))
    await db_session.commit()

    resolved = await resolve_references(db_session, 1, [AttachedReferenceIn(type="day", ref_id="2026-01-05")])
    assert len(resolved) == 1
    assert "AAPL" in resolved[0]
    assert "reviewed setup" in resolved[0]


@pytest.mark.asyncio
async def test_resolve_day_reference_with_nothing_returns_placeholder_text(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    resolved = await resolve_references(db_session, 1, [AttachedReferenceIn(type="day", ref_id="2026-01-05")])
    assert len(resolved) == 1
    assert "No trades or journal entries" in resolved[0]


@pytest.mark.asyncio
async def test_resolve_day_reference_skips_invalid_date():
    from unittest.mock import MagicMock

    resolved = await resolve_references(MagicMock(), 1, [AttachedReferenceIn(type="day", ref_id="not-a-date")])
    assert resolved == []


@pytest.mark.asyncio
async def test_resolve_symbol_reference_orders_most_recent_first(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add_all([
        Trade(
            user_id=1, symbol="AAPL", side="buy", order_type="market", qty=10, fill_price=100.0,
            fees=0.0, filled_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        ),
        Trade(
            user_id=1, symbol="AAPL", side="sell", order_type="market", qty=10, fill_price=110.0,
            fees=0.0, filled_at=datetime(2026, 1, 5, tzinfo=timezone.utc),
        ),
    ])
    await db_session.commit()

    resolved = await resolve_references(db_session, 1, [AttachedReferenceIn(type="symbol", ref_id="aapl")])
    assert len(resolved) == 1
    text = resolved[0]
    assert text.index("BUY") < text.index("SELL")  # oldest first within the "most recent first" listing


@pytest.mark.asyncio
async def test_resolve_symbol_reference_with_no_trades():
    from unittest.mock import AsyncMock, MagicMock

    db = MagicMock()
    db.scalars = AsyncMock(return_value=MagicMock(all=lambda: []))

    resolved = await resolve_references(db, 1, [AttachedReferenceIn(type="symbol", ref_id="TSLA")])
    assert resolved == ["No recent trades found for TSLA."]


@pytest.mark.asyncio
async def test_resolve_references_skips_unknown_type_and_keeps_others(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    trade = Trade(
        user_id=1, symbol="AAPL", side="buy", order_type="market", qty=10,
        fill_price=100.0, fees=0.0, filled_at=datetime.now(timezone.utc),
    )
    db_session.add(trade)
    await db_session.commit()
    await db_session.refresh(trade)

    refs = [
        AttachedReferenceIn.model_construct(type="not_a_real_type", ref_id="1"),
        AttachedReferenceIn(type="trade", ref_id=str(trade.id)),
    ]
    resolved = await resolve_references(db_session, 1, refs)
    assert len(resolved) == 1
