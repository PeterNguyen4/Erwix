"""add summary column to debrief_reports

Revision ID: 0031_debrief_report_summary
Revises: 0030_watchlist_items
Create Date: 2026-08-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0031_debrief_report_summary"
down_revision: Union[str, None] = "0030_watchlist_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("debrief_reports", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("debrief_reports", "summary")
