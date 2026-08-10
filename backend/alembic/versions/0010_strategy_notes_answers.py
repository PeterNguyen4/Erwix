"""strategy_notes: make body optional and add `answers` JSON for archetypes
with tailored follow-up questions (freeform archetypes keep using `body` alone).

Revision ID: 0010_strategy_notes_answers
Revises: 0009_strategy_notes_user_scope
Create Date: 2026-07-12
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_strategy_notes_answers"
down_revision: str | None = "0009_strategy_notes_user_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("strategy_notes", "body", existing_type=sa.Text(), nullable=True)
    op.add_column("strategy_notes", sa.Column("answers", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("strategy_notes", "answers")
    op.alter_column("strategy_notes", "body", existing_type=sa.Text(), nullable=False)
