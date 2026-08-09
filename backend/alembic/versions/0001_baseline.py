"""baseline: trades, strategy_notes, pgvector extension

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-26

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001_baseline"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Enable pgvector now so Phase-2 RAG embeddings need no further setup.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "trades",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("broker_order_id", sa.String(length=64)),
        sa.Column("client_order_id", sa.String(length=64)),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("side", sa.String(length=8), nullable=False),
        sa.Column("order_type", sa.String(length=16)),
        sa.Column("qty", sa.Float(), nullable=False),
        sa.Column("fill_price", sa.Float(), nullable=False),
        sa.Column("fees", sa.Float(), nullable=False, server_default="0"),
        sa.Column("filled_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("raw", sa.Text()),
    )
    op.create_index("ix_trades_symbol", "trades", ["symbol"])
    op.create_index("ix_trades_filled_at", "trades", ["filled_at"])
    op.create_index("ix_trades_broker_order_id", "trades", ["broker_order_id"])
    op.create_index("ix_trades_client_order_id", "trades", ["client_order_id"])

    op.create_table(
        "strategy_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("strategy_notes")
    op.drop_index("ix_trades_client_order_id", table_name="trades")
    op.drop_index("ix_trades_broker_order_id", table_name="trades")
    op.drop_index("ix_trades_filled_at", table_name="trades")
    op.drop_index("ix_trades_symbol", table_name="trades")
    op.drop_table("trades")
