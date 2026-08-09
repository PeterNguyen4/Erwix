"""users: add role column (user|admin), backs role-gated features (e.g. admin-only debrief trigger)

Revision ID: 0025_user_role
Revises: 0024_notifications_seen_at
Create Date: 2026-08-06
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0025_user_role"
down_revision: str | None = "0024_notifications_seen_at"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("role", sa.String(length=16), nullable=False, server_default="user"),
    )


def downgrade() -> None:
    op.drop_column("users", "role")
