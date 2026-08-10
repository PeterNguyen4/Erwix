"""strategy_notes: name + is_active, converting single-strategy to a library

Revision ID: 0022_strategy_library
Revises: 0021_market_insight_cache
Create Date: 2026-08-03
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0022_strategy_library"
down_revision: str | None = "0021_market_insight_cache"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "strategy_notes",
        sa.Column("name", sa.String(length=80), nullable=False, server_default="My Strategy"),
    )
    op.add_column(
        "strategy_notes",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    # Existing rows were the user's one-and-only strategy — keep them loaded/active.
    op.execute("UPDATE strategy_notes SET is_active = true")


def downgrade() -> None:
    op.drop_column("strategy_notes", "is_active")
    op.drop_column("strategy_notes", "name")
