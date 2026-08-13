"""user_preferences: create table

Backfill user_preferences

Revision ID: 0001b_user_preferences
Revises: 0001_baseline
Create Date: 2026-08-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0001b_user_preferences"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(length=128), primary_key=True),
        sa.Column("last_symbol", sa.String(length=16), server_default="AAPL"),
        sa.Column("last_timeframe", sa.String(length=16), server_default="1Day"),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
