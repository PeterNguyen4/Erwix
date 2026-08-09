"""trades: add notes column

Revision ID: 0005_trade_notes
Revises: 0004_trade_client_order_id_widen
Create Date: 2026-07-08

Moves trade journal notes from browser localStorage to the DB so they persist
across devices/sessions and can feed the Phase-2 analyst agent.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0005_trade_notes"
down_revision: str | None = "0004_trade_client_order_id_widen"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trades') THEN
                ALTER TABLE trades ADD COLUMN IF NOT EXISTS notes TEXT;
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE trades DROP COLUMN IF EXISTS notes")
