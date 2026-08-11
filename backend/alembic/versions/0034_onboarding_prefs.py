"""add onboarding_completed_at to user_preferences

Revision ID: 0034_onboarding_prefs
Revises: 0033_backtest_chat_sessions
Create Date: 2026-08-10
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0034_onboarding_prefs"
down_revision: str | None = "0033_backtest_chat_sessions"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "onboarding_completed_at")
