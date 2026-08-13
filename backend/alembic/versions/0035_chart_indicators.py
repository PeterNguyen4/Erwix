"""add chart_indicators, chart_indicator_colors to user_preferences

Revision ID: 0035_chart_indicators
Revises: 0034_onboarding_prefs
Create Date: 2026-08-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0035_chart_indicators"
down_revision: str | None = "0034_onboarding_prefs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("chart_indicators", sa.JSON(), nullable=True),
    )
    op.add_column(
        "user_preferences",
        sa.Column("chart_indicator_colors", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "chart_indicator_colors")
    op.drop_column("user_preferences", "chart_indicators")
