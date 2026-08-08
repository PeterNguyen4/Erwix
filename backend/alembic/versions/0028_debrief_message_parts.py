"""debrief_messages: add parts, an ordered list of {type: text|tool_call, ...}
segments so a streamed reply's interleaving of narration and tool calls can be
replayed in the order it actually happened, instead of collapsing to "all tool
calls, then all text" (content + tool_provenance have no relative ordering).

Revision ID: 0028_debrief_message_parts
Revises: 0027_debrief_ask
Create Date: 2026-08-07
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0028_debrief_message_parts"
down_revision: Union[str, None] = "0027_debrief_ask"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("debrief_messages", sa.Column("parts", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("debrief_messages", "parts")
