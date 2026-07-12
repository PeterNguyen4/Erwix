"""debrief_reports/debrief_messages: background-generated debrief reports,
and user_preferences schedule fields for the debrief job.

Revision ID: 0008_debrief_reports
Revises: 0007_last_debrief_at
Create Date: 2026-07-12

Adds DebriefReport (a persisted, step-navigable debrief run, populated
incrementally by app.services.debrief_jobs) and DebriefMessage (persisted
follow-up chat tied to a report), plus a per-user schedule
(debrief_enabled/debrief_day_of_week/debrief_time) on user_preferences.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0008_debrief_reports"
down_revision: Union[str, None] = "0007_last_debrief_at"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("debrief_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.add_column(
        "user_preferences", sa.Column("debrief_day_of_week", sa.Integer(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("debrief_time", sa.Time(), nullable=True)
    )

    op.create_table(
        "debrief_reports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("window_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=True),
        sa.Column("query", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("scheduled_for", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("total_steps", sa.Integer(), nullable=True),
        sa.Column("current_step", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("steps", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_debrief_reports_user_id", "debrief_reports", ["user_id"])

    op.create_table(
        "debrief_messages",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "report_id",
            sa.Integer(),
            sa.ForeignKey("debrief_reports.id"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_debrief_messages_report_id", "debrief_messages", ["report_id"])


def downgrade() -> None:
    op.drop_index("ix_debrief_messages_report_id", table_name="debrief_messages")
    op.drop_table("debrief_messages")
    op.drop_index("ix_debrief_reports_user_id", table_name="debrief_reports")
    op.drop_table("debrief_reports")
    op.drop_column("user_preferences", "debrief_time")
    op.drop_column("user_preferences", "debrief_day_of_week")
    op.drop_column("user_preferences", "debrief_enabled")
