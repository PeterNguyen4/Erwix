"""trades: log order intent (not just fills) and support bracket orders.

Adds lifecycle/order-class/leg-linking columns so a Trade row is created at
submission time and updated as Alpaca reports further trade-update events,
and so bracket take_profit/stop_loss legs can be logged and linked to their
entry order.

Revision ID: 0011_order_intent_bracket_orders
Revises: 0010_strategy_notes_answers
Create Date: 2026-07-13
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_order_intent_bracket_orders"
down_revision: str | None = "0010_strategy_notes_answers"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column("trades", "fill_price", existing_type=sa.Float(), nullable=True)
    op.alter_column("trades", "filled_at", existing_type=sa.DateTime(timezone=True), nullable=True)

    op.add_column(
        "trades",
        sa.Column("parent_client_order_id", sa.String(length=128), nullable=True),
    )
    op.add_column(
        "trades",
        sa.Column("status", sa.String(length=16), nullable=False, server_default="filled"),
    )
    op.add_column(
        "trades",
        sa.Column("order_class", sa.String(length=16), nullable=False, server_default="simple"),
    )
    op.add_column("trades", sa.Column("leg", sa.String(length=16), nullable=True))
    op.add_column("trades", sa.Column("limit_price", sa.Float(), nullable=True))
    op.add_column("trades", sa.Column("stop_price", sa.Float(), nullable=True))
    op.add_column("trades", sa.Column("take_profit_price", sa.Float(), nullable=True))
    op.add_column("trades", sa.Column("stop_loss_price", sa.Float(), nullable=True))

    op.create_index("ix_trades_parent_client_order_id", "trades", ["parent_client_order_id"])
    op.create_index("ix_trades_status", "trades", ["status"])

    # New rows should default to "new" going forward; existing rows are all
    # historical fills, hence the "filled" server_default above for backfill.
    op.alter_column("trades", "status", server_default="new")


def downgrade() -> None:
    op.drop_index("ix_trades_status", table_name="trades")
    op.drop_index("ix_trades_parent_client_order_id", table_name="trades")
    op.drop_column("trades", "stop_loss_price")
    op.drop_column("trades", "take_profit_price")
    op.drop_column("trades", "stop_price")
    op.drop_column("trades", "limit_price")
    op.drop_column("trades", "leg")
    op.drop_column("trades", "order_class")
    op.drop_column("trades", "status")
    op.drop_column("trades", "parent_client_order_id")

    op.alter_column("trades", "filled_at", existing_type=sa.DateTime(timezone=True), nullable=False)
    op.alter_column("trades", "fill_price", existing_type=sa.Float(), nullable=False)
