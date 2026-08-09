"""trades: widen client_order_id to 128 chars

Revision ID: 0004_trade_client_order_id_widen
Revises: 0003_trade_user_id
Create Date: 2026-07-08

client_order_id is "<clerk_user_id>:<uuid4>" (see alpaca_client.py). Clerk user
ids plus the separator and uuid4 can exceed the original VARCHAR(64), which
caused fill reconciliation/logging to fail with StringDataRightTruncation.
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0004_trade_client_order_id_widen"
down_revision: str | None = "0003_trade_user_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trades') THEN
                ALTER TABLE trades ALTER COLUMN client_order_id TYPE VARCHAR(128);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE trades ALTER COLUMN client_order_id TYPE VARCHAR(64)")
