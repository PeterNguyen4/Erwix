"""add viewed_at column to debrief_reports

Revision ID: 0032_debrief_report_viewed_at
Revises: 0031_debrief_report_summary
Create Date: 2026-08-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0032_debrief_report_viewed_at"
down_revision: str | None = "0031_debrief_report_summary"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "debrief_reports",
        sa.Column("viewed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("debrief_reports", "viewed_at")
