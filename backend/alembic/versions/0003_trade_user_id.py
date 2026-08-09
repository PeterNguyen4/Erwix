"""trades: add user_id

Revision ID: 0003_trade_user_id
Revises: 0002_user_preference_symbol_name
Create Date: 2026-07-02

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0003_trade_user_id"
down_revision: str | None = "0002_user_preference_symbol_name"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # trades itself is created by SQLAlchemy's create_all on app startup rather
    # than a migration, so guard against a fresh DB where the table doesn't exist yet.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trades') THEN
                ALTER TABLE trades ADD COLUMN IF NOT EXISTS user_id VARCHAR(128);
                CREATE INDEX IF NOT EXISTS ix_trades_user_id ON trades (user_id);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_trades_user_id")
    op.execute("ALTER TABLE trades DROP COLUMN IF EXISTS user_id")
