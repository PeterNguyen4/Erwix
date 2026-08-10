"""Trade retrieval for RAG pipeline.

Structural lookups (time window, ordinal position — "my second trade from
4 days ago") are plain SQL, no embeddings involved. Semantic search ("what
went wrong with the one where I panicked") embeds the query with Voyage and
ranks trades by cosine distance in pgvector.
"""

import logging
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Trade
from app.services.embeddings import (
    EMBEDDING_MODEL,
    build_trade_text,
    embed_documents,
    embed_query,
)

logger = logging.getLogger("entro.trade_retrieval")


@dataclass
class ClosedTrade:
    """One realized round-trip produced by FIFO-matching a symbol's fills."""

    symbol: str
    qty: float
    entry_price: float
    exit_price: float
    pnl: float
    opened_at: datetime
    closed_at: datetime


@dataclass
class PnLSummary:
    total_pnl: float
    win_count: int
    loss_count: int
    breakeven_count: int
    win_rate: float | None
    avg_win: float | None
    avg_loss: float | None
    largest_win: float | None
    largest_loss: float | None
    closed_trades: list[ClosedTrade]


def _fifo_match(trades: list[Trade]) -> list[ClosedTrade]:
    """FIFO-match buy/sell fills per symbol into realized round-trips.

    Trades has no realized-PnL column — each row is just one fill (entry or a
    bracket TP/SL leg) — so round-trips have to be reconstructed here: an open
    lots queue per symbol, closed out oldest-first by opposite-side fills.
    Handles both long (buy-then-sell) and short (sell-then-buy) round-trips.
    """
    lots: dict[str, deque[tuple[float, float, datetime]]] = defaultdict(
        deque
    )  # (qty, price, opened_at)
    lot_side: dict[str, str] = {}
    closed: list[ClosedTrade] = []

    for t in sorted(trades, key=lambda t: t.filled_at):
        if t.fill_price is None or t.filled_at is None or t.qty <= 0:
            continue
        symbol_lots = lots[t.symbol]
        qty_remaining = t.qty

        if symbol_lots and lot_side.get(t.symbol) != t.side:
            while qty_remaining > 1e-9 and symbol_lots:
                open_qty, open_price, opened_at = symbol_lots[0]
                matched = min(qty_remaining, open_qty)
                pnl = (
                    (t.fill_price - open_price) * matched
                    if lot_side[t.symbol] == "buy"
                    else (open_price - t.fill_price) * matched
                )
                closed.append(
                    ClosedTrade(
                        symbol=t.symbol,
                        qty=matched,
                        entry_price=open_price,
                        exit_price=t.fill_price,
                        pnl=pnl,
                        opened_at=opened_at,
                        closed_at=t.filled_at,
                    )
                )
                qty_remaining -= matched
                remaining_open = open_qty - matched
                if remaining_open <= 1e-9:
                    symbol_lots.popleft()
                else:
                    symbol_lots[0] = (remaining_open, open_price, opened_at)

        if qty_remaining > 1e-9:
            symbol_lots.append((qty_remaining, t.fill_price, t.filled_at))
            lot_side[t.symbol] = t.side

    return closed


def _summarize_closed(closed: list[ClosedTrade]) -> PnLSummary:
    wins = [c.pnl for c in closed if c.pnl > 0]
    losses = [c.pnl for c in closed if c.pnl < 0]
    breakeven_count = len(closed) - len(wins) - len(losses)
    decided = len(wins) + len(losses)

    return PnLSummary(
        total_pnl=sum(c.pnl for c in closed),
        win_count=len(wins),
        loss_count=len(losses),
        breakeven_count=breakeven_count,
        win_rate=(len(wins) / decided) if decided else None,
        avg_win=(sum(wins) / len(wins)) if wins else None,
        avg_loss=(sum(losses) / len(losses)) if losses else None,
        largest_win=max(wins) if wins else None,
        largest_loss=min(losses) if losses else None,
        closed_trades=sorted(closed, key=lambda c: c.closed_at),
    )


async def _fifo_match_all(db: AsyncSession, user_id: int) -> list[ClosedTrade]:
    all_trades = list(
        (
            await db.scalars(
                select(Trade).where(Trade.user_id == user_id, Trade.filled_at.isnot(None))
            )
        ).all()
    )
    return _fifo_match(all_trades)


async def compute_pnl_summary(
    db: AsyncSession,
    user_id: int,
    start: datetime | None = None,
    end: datetime | None = None,
) -> PnLSummary:
    """Realized PnL + win/loss stats for round-trips *closed* in [start, end].

    Matching runs over the user's full fill history (not just the window),
    since a trade opened before the window but closed inside it still needs
    its entry price — only the closing side of each round-trip is filtered
    against the window.
    """
    closed = await _fifo_match_all(db, user_id)
    if start is not None:
        closed = [c for c in closed if c.closed_at >= start]
    if end is not None:
        closed = [c for c in closed if c.closed_at <= end]
    return _summarize_closed(closed)


async def compute_pnl_summary_pair(
    db: AsyncSession,
    user_id: int,
    window_a: tuple[datetime, datetime],
    window_b: tuple[datetime, datetime],
) -> tuple[PnLSummary, PnLSummary]:
    """PnL stats for two arbitrary windows, matched in one pass over the
    user's fill history (rather than two separate compute_pnl_summary calls,
    which would each independently re-fetch and re-FIFO-match everything)."""
    closed = await _fifo_match_all(db, user_id)
    a_start, a_end = window_a
    b_start, b_end = window_b

    a = [c for c in closed if a_start <= c.closed_at <= a_end]
    b = [c for c in closed if b_start <= c.closed_at <= b_end]
    return _summarize_closed(a), _summarize_closed(b)


async def compute_pnl_weekly_comparison(
    db: AsyncSession, user_id: int
) -> tuple[PnLSummary, PnLSummary]:
    """This-week vs previous-week PnL stats."""
    now = datetime.now(UTC)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)
    return await compute_pnl_summary_pair(db, user_id, (week_ago, now), (two_weeks_ago, week_ago))


async def compute_pnl_daily_trend(
    db: AsyncSession, user_id: int, days: int = 14
) -> dict[str, list]:
    """Daily snapshot for trend lines."""
    closed = await _fifo_match_all(db, user_id)
    now = datetime.now(UTC)
    start = now - timedelta(days=days - 1)
    closed = sorted((c for c in closed if c.closed_at >= start), key=lambda c: c.closed_at)

    win_rate: list[float | None] = []
    risk_reward: list[float | None] = []
    total_pnl: list[float] = []
    win_loss_diff: list[int] = []

    idx = 0
    running_wins: list[float] = []
    running_losses: list[float] = []
    running_total = 0.0
    for day_offset in range(days):
        day_end = start + timedelta(days=day_offset + 1)
        while idx < len(closed) and closed[idx].closed_at < day_end:
            c = closed[idx]
            running_total += c.pnl
            if c.pnl > 0:
                running_wins.append(c.pnl)
            elif c.pnl < 0:
                running_losses.append(c.pnl)
            idx += 1
        decided = len(running_wins) + len(running_losses)
        win_rate.append((len(running_wins) / decided) if decided else None)
        avg_win = (sum(running_wins) / len(running_wins)) if running_wins else None
        avg_loss = (sum(running_losses) / len(running_losses)) if running_losses else None
        risk_reward.append((avg_win / abs(avg_loss)) if avg_win is not None and avg_loss else None)
        total_pnl.append(running_total)
        win_loss_diff.append(len(running_wins) - len(running_losses))

    return {
        "win_rate": win_rate,
        "risk_reward": risk_reward,
        "total_pnl": total_pnl,
        "win_loss_diff": win_loss_diff,
    }


async def count_trades_since(db: AsyncSession, user_id: int, since: datetime) -> int:
    """Number of a user's fills strictly after `since` — used both by the sidebar
    badge (GET /api/agent/status) and the scheduler's "anything new to debrief?"
    check (app.services.debrief_jobs)."""
    return (
        await db.scalar(
            select(func.count())
            .select_from(Trade)
            .where(Trade.user_id == user_id, Trade.filled_at > since)
        )
        or 0
    )


async def latest_fill_since(db: AsyncSession, user_id: int, since: datetime) -> datetime | None:
    """Most recent fill time after last."""
    return await db.scalar(
        select(func.max(Trade.filled_at)).where(Trade.user_id == user_id, Trade.filled_at > since)
    )


def primary_symbol(trades: list[Trade]) -> str | None:
    """Most-traded symbol in a window, used to pick what the whiteboard charts
    when the caller didn't pin a symbol (e.g. a multi-symbol window debrief)."""
    if not trades:
        return None
    counts: dict[str, int] = {}
    for t in trades:
        counts[t.symbol] = counts.get(t.symbol, 0) + 1
    return max(counts, key=counts.get)


async def get_trades_window(
    db: AsyncSession, user_id: int, start: datetime, end: datetime
) -> list[Trade]:
    """All of a user's fills in [start, end], oldest first — the window the
    Phase-2 analyst agent reviews."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.filled_at >= start, Trade.filled_at <= end)
        .order_by(Trade.filled_at.asc())
    )
    return list((await db.scalars(stmt)).all())


async def embed_trade(db: AsyncSession, trade: Trade) -> None:
    """(Re-)embed a single trade — e.g. right after its notes change — and commit."""
    vector = embed_documents([build_trade_text(trade)])[0]
    trade.embedding = vector
    trade.embedding_model = EMBEDDING_MODEL
    trade.embedded_at = datetime.now(UTC)
    await db.commit()


async def embed_trade_best_effort(db: AsyncSession, trade: Trade) -> None:
    """(Re-)embed a trade, logging and rolling back on failure instead of raising —
    embedding must never block the fill/notes write it's attached to."""
    try:
        await embed_trade(db, trade)
    except Exception:
        await db.rollback()
        logger.warning("Failed to embed trade %s", trade.id, exc_info=True)


async def backfill_embeddings(db: AsyncSession, user_id: int, batch_size: int = 50) -> int:
    """Embed any of the user's trades that don't yet have one (new fills, or
    trades logged before this pipeline existed, or a stale embedding model).
    Returns the number embedded."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id)
        .where((Trade.embedding.is_(None)) | (Trade.embedding_model != EMBEDDING_MODEL))
        .limit(batch_size)
    )
    trades = list((await db.scalars(stmt)).all())
    if not trades:
        return 0
    vectors = embed_documents([build_trade_text(t) for t in trades])
    now = datetime.now(UTC)
    for trade, vector in zip(trades, vectors, strict=True):
        trade.embedding = vector
        trade.embedding_model = EMBEDDING_MODEL
        trade.embedded_at = now
    await db.commit()
    return len(trades)


async def semantic_search(
    db: AsyncSession, user_id: int, query: str, limit: int = 5
) -> list[Trade]:
    """Find the user's trades whose embedded text is closest in meaning to `query`."""
    query_vector = embed_query(query)
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.embedding.is_not(None))
        .order_by(Trade.embedding.cosine_distance(query_vector))
        .limit(limit)
    )
    return list((await db.scalars(stmt)).all())
