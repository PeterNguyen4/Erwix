"""trades: add embedding columns for the trade retrieval/RAG pipeline

Revision ID: 0006_trade_embedding
Revises: 0005_trade_notes
Create Date: 2026-07-08

Adds a pgvector column (populated via Voyage AI — see app/services/embeddings.py)
plus bookkeeping columns so re-embedding after a model change can be detected.
The `vector` extension itself was already enabled in 0001_baseline.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

revision: str = "0006_trade_embedding"
down_revision: Union[str, None] = "0005_trade_notes"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EMBEDDING_DIM = 512


def upgrade() -> None:
    op.add_column("trades", sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=True))
    op.add_column("trades", sa.Column("embedding_model", sa.String(length=64), nullable=True))
    op.add_column("trades", sa.Column("embedded_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_trades_embedding_cosine",
        "trades",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_trades_embedding_cosine", table_name="trades")
    op.drop_column("trades", "embedded_at")
    op.drop_column("trades", "embedding_model")
    op.drop_column("trades", "embedding")
