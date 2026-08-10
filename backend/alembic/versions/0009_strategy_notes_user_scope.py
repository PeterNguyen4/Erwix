"""strategy_notes: rework for the Strategy tab (per-user archetype + free-form
body + strategist-agent-generated structured_summary).

Revision ID: 0009_strategy_notes_user_scope
Revises: 0008_debrief_reports
Create Date: 2026-07-12

strategy_notes was defined but never wired up (no router/UI, no user_id) so
this recreates the table rather than migrating data — nothing meaningful is
stored in it yet.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_strategy_notes_user_scope"
down_revision: str | None = "0008_debrief_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("strategy_notes")
    op.create_table(
        "strategy_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("archetype", sa.String(length=32), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("structured_summary", sa.Text(), nullable=True),
        sa.Column("summary_model", sa.String(length=64), nullable=True),
        sa.Column("summarized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_strategy_notes_user_id", "strategy_notes", ["user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_strategy_notes_user_id", table_name="strategy_notes")
    op.drop_table("strategy_notes")
    op.create_table(
        "strategy_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(length=128), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
