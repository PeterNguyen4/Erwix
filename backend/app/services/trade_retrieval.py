"""Trade retrieval for RAG pipeline.

Structural lookups (time window, ordinal position — "my second trade from
4 days ago") are plain SQL, no embeddings involved. Semantic search ("what
went wrong with the one where I panicked") embeds the query with Voyage and
ranks trades by cosine distance in pgvector.
"""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Trade
from app.services.embeddings import EMBEDDING_MODEL, build_trade_text, embed_documents, embed_query


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
