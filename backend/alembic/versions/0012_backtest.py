"""backtesting: saved configs + run history.

Adds backtest_configs (structured rule config produced by the hint-options
library and/or config-chat agent) and backtest_runs (a single bar-by-bar
replay of a config over a historical window, see app.services.backtest_engine).

Revision ID: 0012_backtest
Revises: 0011_order_intent_bracket_orders
Create Date: 2026-07-14
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0012_backtest"
down_revision: Union[str, None] = "0011_order_intent_bracket_orders"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "backtest_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("symbol", sa.String(length=16), nullable=False),
        sa.Column("timeframe", sa.String(length=16), nullable=False, server_default="1Day"),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_backtest_configs_user_id", "backtest_configs", ["user_id"])

    op.create_table(
        "backtest_runs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.String(length=128), nullable=False),
        sa.Column("config_id", sa.Integer(), sa.ForeignKey("backtest_configs.id"), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_backtest_runs_user_id", "backtest_runs", ["user_id"])
    op.create_index("ix_backtest_runs_config_id", "backtest_runs", ["config_id"])


def downgrade() -> None:
    op.drop_index("ix_backtest_runs_config_id", table_name="backtest_runs")
    op.drop_index("ix_backtest_runs_user_id", table_name="backtest_runs")
    op.drop_table("backtest_runs")

    op.drop_index("ix_backtest_configs_user_id", table_name="backtest_configs")
    op.drop_table("backtest_configs")
