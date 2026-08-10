"""user_preferences: add last_symbol_name

Revision ID: 0002_user_preference_symbol_name
Revises: 0001_baseline
Create Date: 2026-07-01

"""

from collections.abc import Sequence

from alembic import op

revision: str = "0002_user_preference_symbol_name"
down_revision: str | None = "0001_baseline"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # user_preferences itself is created by SQLAlchemy's create_all on app
    # startup rather than a migration, so guard against a fresh DB where the
    # table doesn't exist yet.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'user_preferences'
            ) THEN
                ALTER TABLE user_preferences
                ADD COLUMN IF NOT EXISTS last_symbol_name VARCHAR(128);
            END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE user_preferences DROP COLUMN IF EXISTS last_symbol_name")
