"""journal_entries: add timeframe (chart timeframe the trade was read off, e.g.
15Min/1Day), matching the timeframe vocabulary BacktestChat already uses.

Revision ID: 0029_journal_entry_timeframe
Revises: 0028_debrief_message_parts
Create Date: 2026-08-08
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0029_journal_entry_timeframe"
down_revision: str | None = "0028_debrief_message_parts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "journal_entries", sa.Column("timeframe", sa.String(length=16), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("journal_entries", "timeframe")
