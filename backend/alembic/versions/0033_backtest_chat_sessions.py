"""add backtest_chat_sessions table

Revision ID: 0033_backtest_chat_sessions
Revises: 0032_debrief_report_viewed_at
Create Date: 2026-08-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0033_backtest_chat_sessions"
down_revision: str | None = "0032_debrief_report_viewed_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "backtest_chat_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False, server_default="New chat"),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("messages", sa.JSON(), nullable=False),
        sa.Column("input", sa.Text(), nullable=False, server_default=""),
        sa.Column("window_start", sa.String(length=10), nullable=True),
        sa.Column("window_end", sa.String(length=10), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
        ),
    )
    op.create_index("ix_backtest_chat_sessions_user_id", "backtest_chat_sessions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_backtest_chat_sessions_user_id", table_name="backtest_chat_sessions")
    op.drop_table("backtest_chat_sessions")
