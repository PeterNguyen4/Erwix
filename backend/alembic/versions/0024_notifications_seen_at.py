"""user_preferences: track when the user last opened the notifications bell

Revision ID: 0024_notifications_seen_at
Revises: 0023_strategy_rule_compile_error
Create Date: 2026-08-05
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0024_notifications_seen_at"
down_revision: Union[str, None] = "0023_strategy_rule_compile_error"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("notifications_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_preferences", "notifications_seen_at")
