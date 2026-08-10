"""debrief_reports: add report_type discriminator (scheduled|ask), nullable
window_start/end for the new open-ended "ask" conversation type;
debrief_messages: add tool_provenance for router-graph tool call records.

Revision ID: 0027_debrief_ask
Revises: 0026_strategy_trading_prefs
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0027_debrief_ask"
down_revision: str | None = "0026_strategy_trading_prefs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "debrief_reports",
        sa.Column(
            "report_type",
            sa.String(length=16),
            nullable=False,
            server_default="scheduled",
        ),
    )
    op.alter_column(
        "debrief_reports",
        "window_start",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
    op.alter_column(
        "debrief_reports",
        "window_end",
        existing_type=sa.DateTime(timezone=True),
        nullable=True,
    )
    op.add_column("debrief_messages", sa.Column("tool_provenance", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("debrief_messages", "tool_provenance")
    op.alter_column(
        "debrief_reports",
        "window_end",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.alter_column(
        "debrief_reports",
        "window_start",
        existing_type=sa.DateTime(timezone=True),
        nullable=False,
    )
    op.drop_column("debrief_reports", "report_type")
