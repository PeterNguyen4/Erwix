"""strategy_notes: add preferred_symbols/context_timeframe/entry_timeframe, extracted
from the trader's description so BacktestChat.loadStrategy() can seed symbol/timeframe

Revision ID: 0026_strategy_trading_prefs
Revises: 0025_user_role
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0026_strategy_trading_prefs"
down_revision: str | None = "0025_user_role"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "strategy_notes", sa.Column("preferred_symbols", sa.JSON(), nullable=True)
    )
    op.add_column(
        "strategy_notes",
        sa.Column("context_timeframe", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "strategy_notes",
        sa.Column("entry_timeframe", sa.String(length=16), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("strategy_notes", "entry_timeframe")
    op.drop_column("strategy_notes", "context_timeframe")
    op.drop_column("strategy_notes", "preferred_symbols")
