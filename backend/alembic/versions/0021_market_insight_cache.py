"""add market_insight_cache table

Revision ID: 0021_market_insight_cache
Revises: 0020_journal_entries
Create Date: 2026-08-02
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0021_market_insight_cache"
down_revision: str | None = "0020_journal_entries"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "market_insight_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id"),
            nullable=False,
            unique=True,
        ),
        sa.Column("articles_hash", sa.String(length=64), nullable=False),
        sa.Column("sentiment", sa.String(length=16), nullable=False),
        sa.Column("advice", sa.Text(), nullable=False),
        sa.Column("rationale", sa.JSON(), nullable=False),
        sa.Column("highlighted_urls", sa.JSON(), nullable=False),
        sa.Column(
            "generated_at", sa.DateTime(timezone=True), server_default=sa.func.now()
        ),
    )
    op.create_index(
        "ix_market_insight_cache_user_id", "market_insight_cache", ["user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_market_insight_cache_user_id", table_name="market_insight_cache")
    op.drop_table("market_insight_cache")
