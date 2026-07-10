"""Voyage AI embedding client for trade-retrieval/RAG pipeline.

Trades are embedded with input_type="document"; user search text is embedded
with input_type="query" — The two are tuned differently for asymmetric
retrieval (short query vs. longer stored text).
"""

import voyageai

from app.config import get_settings
from app.models import Trade

EMBEDDING_MODEL = "voyage-3.5-lite"
EMBEDDING_DIMENSIONS = 512

_client: voyageai.Client | None = None


def _get_client() -> voyageai.Client:
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.has_voyage_creds:
            raise RuntimeError("Voyage API key not configured")
        _client = voyageai.Client(api_key=settings.voyage_api_key)
    return _client


def build_trade_text(trade: Trade) -> str:
    """Render a Trade row into descriptive text for embedding."""
    parts = [
        f"{trade.side.upper()} {trade.qty:g} {trade.symbol} @ ${trade.fill_price:.2f}",
        f"filled {trade.filled_at:%Y-%m-%d %H:%M}",
    ]
    if trade.order_type:
        parts.append(f"{trade.order_type} order")
    if trade.notes:
        parts.append(f"notes: {trade.notes}")
    return " — ".join(parts)


def embed_documents(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    result = _get_client().embed(
        texts,
        model=EMBEDDING_MODEL,
        input_type="document",
        output_dimension=EMBEDDING_DIMENSIONS,
    )
    return result.embeddings


def embed_query(text: str) -> list[float]:
    result = _get_client().embed(
        [text],
        model=EMBEDDING_MODEL,
        input_type="query",
        output_dimension=EMBEDDING_DIMENSIONS,
    )
    return result.embeddings[0]
