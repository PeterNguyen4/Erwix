"""compose index on (user_id, filled_at) for trades

Revision ID: 0036_trades_user_filled_index
Revises: 0035_chart_indicators
Create Date: 2026-08-13
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0036_trades_user_filled_index"
down_revision: str | None = "0035_chart_indicators"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_trades_user_id_filled_at", "trades", ["user_id", "filled_at"])


def downgrade() -> None:
    op.drop_index("ix_trades_user_id_filled_at", table_name="trades")
