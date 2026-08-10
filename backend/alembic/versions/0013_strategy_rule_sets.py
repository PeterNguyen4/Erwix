"""strategy rule sets: compiled machine-checkable rules from a strategy note.

Adds strategy_rule_sets — one compiled ruleset per user, produced from
StrategyNote.body by app.services.strategy_agent.acompile_rules and evaluated
deterministically by app.services.rule_engine.

Revision ID: 0013_strategy_rule_sets
Revises: 0012_backtest
Create Date: 2026-07-20
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0013_strategy_rule_sets"
down_revision: str | None = "0012_backtest"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "strategy_rule_sets",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False, unique=True),
        sa.Column("note_id", sa.Integer(), sa.ForeignKey("strategy_notes.id"), nullable=False),
        sa.Column("rules", sa.JSON(), nullable=False),
        sa.Column("compiled_model", sa.String(length=64), nullable=True),
        sa.Column("compiled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_body_hash", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_strategy_rule_sets_user_id", "strategy_rule_sets", ["user_id"])
    op.create_index("ix_strategy_rule_sets_note_id", "strategy_rule_sets", ["note_id"])


def downgrade() -> None:
    op.drop_index("ix_strategy_rule_sets_note_id", table_name="strategy_rule_sets")
    op.drop_index("ix_strategy_rule_sets_user_id", table_name="strategy_rule_sets")
    op.drop_table("strategy_rule_sets")
