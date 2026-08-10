"""local auth: replace Clerk user_id strings with a local users table.

Adds `users` (username/hashed_password) and repoints every user_id column
from a loose Clerk-issued String(128) to an Integer FK on users.id. Existing
user-scoped data is dropped rather than migrated — Clerk IDs have no
correspondence to the new local user rows, and this is still a personal
paper-trading project with nothing worth preserving across the auth swap.

Revision ID: 0014_local_auth
Revises: 0013_strategy_rule_sets
Create Date: 2026-07-25
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0014_local_auth"
down_revision: str | None = "0013_strategy_rule_sets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# (table, old index name on user_id, was user_id the primary key)
_TABLES = [
    ("user_preferences", None, True),
    ("trades", "ix_trades_user_id", False),
    ("debrief_reports", "ix_debrief_reports_user_id", False),
    ("strategy_notes", "ix_strategy_notes_user_id", False),
    ("strategy_rule_sets", "ix_strategy_rule_sets_user_id", False),
    ("backtest_configs", "ix_backtest_configs_user_id", False),
    ("backtest_runs", "ix_backtest_runs_user_id", False),
]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(length=128), nullable=False),
        sa.Column("hashed_password", sa.String(length=256), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)
    op.create_index("ix_users_id", "users", ["id"])

    for table, old_index, was_pk in _TABLES:
        op.execute(f"TRUNCATE TABLE {table} CASCADE")

        if old_index:
            op.drop_index(old_index, table_name=table)

        if was_pk:
            # user_preferences: user_id was the sole primary key; swap to a
            # surrogate id and repoint user_id at the new users table.
            op.drop_constraint("user_preferences_pkey", "user_preferences", type_="primary")
            op.drop_column(table, "user_id")
            op.add_column(
                table,
                sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
            )
            op.add_column(
                table,
                sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            )
        else:
            op.drop_column(table, "user_id")
            op.add_column(
                table,
                sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            )

        op.create_index(f"ix_{table}_user_id", table, ["user_id"])


def downgrade() -> None:
    for table, old_index, was_pk in _TABLES:
        op.execute(f"TRUNCATE TABLE {table} CASCADE")
        op.drop_index(f"ix_{table}_user_id", table_name=table)
        op.drop_column(table, "user_id")

        if was_pk:
            op.drop_column(table, "id")
            op.add_column(table, sa.Column("user_id", sa.String(length=128), primary_key=True))
        else:
            op.add_column(table, sa.Column("user_id", sa.String(length=128), nullable=True))
            if old_index:
                op.create_index(old_index, table, ["user_id"])

    op.drop_index("ix_users_id", table_name="users")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
