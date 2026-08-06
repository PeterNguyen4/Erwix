"""notification_dismissals: per-instance read/dismiss state for the notifications bell

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
    op.create_table(
        "notification_dismissals",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), index=True),
        sa.Column("notification_key", sa.String(length=160), index=True),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("dismissed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "notification_key", name="uq_notification_dismissal"),
    )


def downgrade() -> None:
    op.drop_table("notification_dismissals")
