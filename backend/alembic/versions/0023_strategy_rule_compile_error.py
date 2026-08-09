"""strategy_rule_sets: track last compile error, allow rules to be absent

Revision ID: 0023_strategy_rule_compile_error
Revises: 0022_strategy_library
Create Date: 2026-08-04
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0023_strategy_rule_compile_error"
down_revision: str | None = "0022_strategy_library"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "strategy_rule_sets",
        sa.Column("compile_error", sa.String(length=500), nullable=True),
    )
    op.alter_column(
        "strategy_rule_sets", "rules", existing_type=sa.JSON(), nullable=True
    )


def downgrade() -> None:
    op.alter_column(
        "strategy_rule_sets", "rules", existing_type=sa.JSON(), nullable=False
    )
    op.drop_column("strategy_rule_sets", "compile_error")
