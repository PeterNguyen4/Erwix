"""user_preferences: add last_debrief_at for the analyst debrief agent

Revision ID: 0007_last_debrief_at
Revises: 0006_trade_embedding
Create Date: 2026-07-10

Tracks when the LangGraph analyst debrief last ran for a user, so
GET /api/agent/status can tell the frontend whether new fills exist
since the last debrief (see app/routers/agent.py).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0007_last_debrief_at"
down_revision: Union[str, None] = "0006_trade_embedding"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences", sa.Column("last_debrief_at", sa.DateTime(timezone=True), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "last_debrief_at")
