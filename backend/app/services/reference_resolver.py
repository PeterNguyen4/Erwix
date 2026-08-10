"""Resolves user-attached chat references (trade/journal-entry/day/symbol —
see DebriefChat's `+`/`@` attach picker) into LLM-readable text, fetched fresh
per request rather than snapshotted, so edits to the underlying row are always
reflected."""

from datetime import UTC, date, datetime, time

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import JournalEntry, Trade
from app.schemas import AttachedReferenceIn
from app.services.embeddings import build_trade_text
from app.services.trade_retrieval import get_trades_window

SYMBOL_LOOKBACK_LIMIT = 5


def _build_journal_entry_text(entry: JournalEntry) -> str:
    parts = [f"Journal entry — {entry.entry_date:%Y-%m-%d}"]
    if entry.symbol:
        parts.append(entry.symbol)
    if entry.side:
        parts.append(entry.side)
    if entry.entry_price is not None:
        parts.append(f"entry ${entry.entry_price:.2f}")
    if entry.exit_price is not None:
        parts.append(f"exit ${entry.exit_price:.2f}")
    if entry.order_amount is not None:
        parts.append(f"amount {entry.order_amount:g}")
    text = " — ".join(parts)
    if entry.notes:
        text += f"\nnotes: {entry.notes}"
    return text


async def _resolve_trade(db: AsyncSession, user_id: int, ref_id: str) -> str | None:
    try:
        trade_id = int(ref_id)
    except ValueError:
        return None
    trade = await db.get(Trade, trade_id)
    if trade is None or trade.user_id != user_id:
        return None
    return build_trade_text(trade)


async def _resolve_journal_entry(db: AsyncSession, user_id: int, ref_id: str) -> str | None:
    try:
        entry_id = int(ref_id)
    except ValueError:
        return None
    entry = await db.get(JournalEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        return None
    return _build_journal_entry_text(entry)


async def _resolve_day(db: AsyncSession, user_id: int, ref_id: str) -> str | None:
    try:
        day = date.fromisoformat(ref_id)
    except ValueError:
        return None
    start = datetime.combine(day, time.min, tzinfo=UTC)
    end = datetime.combine(day, time.max, tzinfo=UTC)
    trades = await get_trades_window(db, user_id, start, end)
    entries = list(
        (
            await db.scalars(
                select(JournalEntry).where(
                    JournalEntry.user_id == user_id, JournalEntry.entry_date == day
                )
            )
        ).all()
    )
    if not trades and not entries:
        return f"No trades or journal entries on {day:%Y-%m-%d}."
    lines = [f"Day summary — {day:%Y-%m-%d}"]
    lines.extend(build_trade_text(t) for t in trades)
    lines.extend(_build_journal_entry_text(e) for e in entries)
    return "\n".join(lines)


async def _resolve_symbol(db: AsyncSession, user_id: int, ref_id: str) -> str | None:
    symbol = ref_id.strip().upper()
    if not symbol:
        return None
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.symbol == symbol)
        .order_by(Trade.filled_at.desc())
        .limit(SYMBOL_LOOKBACK_LIMIT)
    )
    trades = list((await db.scalars(stmt)).all())
    if not trades:
        return f"No recent trades found for {symbol}."
    lines = [f"Recent {symbol} trades (most recent first)"]
    lines.extend(build_trade_text(t) for t in reversed(trades))
    return "\n".join(lines)


_RESOLVERS = {
    "trade": _resolve_trade,
    "journal_entry": _resolve_journal_entry,
    "day": _resolve_day,
    "symbol": _resolve_symbol,
}


async def resolve_references(
    db: AsyncSession, user_id: int, refs: list[AttachedReferenceIn]
) -> list[str]:
    """Resolve each attached reference to text, scoped to `user_id`. Missing
    or foreign-user references are skipped rather than raising, so one bad
    reference doesn't fail the whole follow-up request."""
    resolved: list[str] = []
    for ref in refs:
        resolver = _RESOLVERS.get(ref.type)
        if resolver is None:
            continue
        text = await resolver(db, user_id, ref.ref_id)
        if text:
            resolved.append(text)
    return resolved
