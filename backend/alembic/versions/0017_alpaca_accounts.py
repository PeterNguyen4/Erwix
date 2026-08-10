"""add alpaca_accounts table

Revision ID: 0017_alpaca_accounts
Revises: 0016_refresh_tokens
Create Date: 2026-07-27
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0017_alpaca_accounts"
down_revision: str | None = "0016_refresh_tokens"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alpaca_accounts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("access_token", sa.Text(), nullable=False),
        sa.Column("env", sa.String(length=16), nullable=False),
        sa.Column("alpaca_account_id", sa.String(length=64), nullable=True),
        sa.Column("connected_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_alpaca_accounts_user_id", "alpaca_accounts", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_alpaca_accounts_user_id", table_name="alpaca_accounts")
    op.drop_table("alpaca_accounts")
