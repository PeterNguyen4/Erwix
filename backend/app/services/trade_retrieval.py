"""Trade retrieval for RAG pipeline.

Structural lookups (time window, ordinal position — "my second trade from
4 days ago") are plain SQL, no embeddings involved. Semantic search ("what
went wrong with the one where I panicked") embeds the query with Voyage and
ranks trades by cosine distance in pgvector.
"""

from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Trade
from app.services.embeddings import EMBEDDING_MODEL, build_trade_text, embed_documents, embed_query


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
    lots: dict[str, deque[tuple[float, float, datetime]]] = defaultdict(deque)  # (qty, price, opened_at)
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


def compute_pnl_summary(
    db: Session,
    user_id: str,
    start: datetime | None = None,
    end: datetime | None = None,
) -> PnLSummary:
    """Realized PnL + win/loss stats for round-trips *closed* in [start, end].

    Matching runs over the user's full fill history (not just the window),
    since a trade opened before the window but closed inside it still needs
    its entry price — only the closing side of each round-trip is filtered
    against the window.
    """
    all_trades = list(
        db.scalars(select(Trade).where(Trade.user_id == user_id, Trade.filled_at.isnot(None))).all()
    )
    closed = _fifo_match(all_trades)
    if start is not None:
        closed = [c for c in closed if c.closed_at >= start]
    if end is not None:
        closed = [c for c in closed if c.closed_at <= end]

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


def count_trades_since(db: Session, user_id: str, since: datetime) -> int:
    """Number of a user's fills strictly after `since` — used both by the sidebar
    badge (GET /api/agent/status) and the scheduler's "anything new to debrief?"
    check (app.services.debrief_jobs)."""
    return db.scalar(
        select(func.count()).select_from(Trade).where(Trade.user_id == user_id, Trade.filled_at > since)
    ) or 0


def primary_symbol(trades: list[Trade]) -> str | None:
    """Most-traded symbol in a window, used to pick what the whiteboard charts
    when the caller didn't pin a symbol (e.g. a multi-symbol window debrief)."""
    if not trades:
        return None
    counts: dict[str, int] = {}
    for t in trades:
        counts[t.symbol] = counts.get(t.symbol, 0) + 1
    return max(counts, key=counts.get)


def get_trades_window(db: Session, user_id: str, start: datetime, end: datetime) -> list[Trade]:
    """All of a user's fills in [start, end], oldest first — the window the
    Phase-2 analyst agent reviews."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.filled_at >= start, Trade.filled_at <= end)
        .order_by(Trade.filled_at.asc())
    )
    return list(db.scalars(stmt).all())


def embed_trade(db: Session, trade: Trade) -> None:
    """(Re-)embed a single trade — e.g. right after its notes change — and commit."""
    vector = embed_documents([build_trade_text(trade)])[0]
    trade.embedding = vector
    trade.embedding_model = EMBEDDING_MODEL
    trade.embedded_at = datetime.now(timezone.utc)
    db.commit()


def backfill_embeddings(db: Session, user_id: str, batch_size: int = 50) -> int:
    """Embed any of the user's trades that don't yet have one (new fills, or
    trades logged before this pipeline existed, or a stale embedding model).
    Returns the number embedded."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id)
        .where((Trade.embedding.is_(None)) | (Trade.embedding_model != EMBEDDING_MODEL))
        .limit(batch_size)
    )
    trades = list(db.scalars(stmt).all())
    if not trades:
        return 0
    vectors = embed_documents([build_trade_text(t) for t in trades])
    now = datetime.now(timezone.utc)
    for trade, vector in zip(trades, vectors):
        trade.embedding = vector
        trade.embedding_model = EMBEDDING_MODEL
        trade.embedded_at = now
    db.commit()
    return len(trades)


def semantic_search(db: Session, user_id: str, query: str, limit: int = 5) -> list[Trade]:
    """Find the user's trades whose embedded text is closest in meaning to `query`."""
    query_vector = embed_query(query)
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.embedding.is_not(None))
        .order_by(Trade.embedding.cosine_distance(query_vector))
        .limit(limit)
    )
    return list(db.scalars(stmt).all())
