"""Auto-logs every fill reported by Alpaca into the `trades` table.

Runs as a background task started in the FastAPI lifespan. On each
trade-update event with status 'fill' / 'partial_fill' it persists a Trade row,
which is the data the Phase-2 analyst agent reviews over a window.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

from app.alpaca_client import make_trading_stream, user_id_from_client_order_id
from app.db import SessionLocal
from app.models import Trade

logger = logging.getLogger("entro.execution_logger")

_FILL_EVENTS = {"fill", "partial_fill"}


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


async def _handle_trade_update(data) -> None:
    """alpaca TradeUpdate handler."""
    event = getattr(data, "event", None)
    if event not in _FILL_EVENTS:
        return

    order = getattr(data, "order", None)
    if order is None:
        return

    filled_at = getattr(order, "filled_at", None) or datetime.now(timezone.utc)
    price = getattr(data, "price", None) or getattr(order, "filled_avg_price", None)
    qty = getattr(data, "qty", None) or getattr(order, "filled_qty", None)

    client_order_id = getattr(order, "client_order_id", None)
    trade = Trade(
        broker_order_id=str(getattr(order, "id", "") or "") or None,
        client_order_id=client_order_id,
        user_id=user_id_from_client_order_id(client_order_id),
        symbol=getattr(order, "symbol", ""),
        side=getattr(getattr(order, "side", None), "value", str(getattr(order, "side", ""))),
        order_type=getattr(
            getattr(order, "order_type", None),
            "value",
            str(getattr(order, "order_type", "")) or None,
        ),
        qty=_to_float(qty),
        fill_price=_to_float(price),
        fees=0.0,
        filled_at=filled_at,
        raw=json.dumps(data, default=str),
    )

    db = SessionLocal()
    try:
        db.add(trade)
        db.commit()
        logger.info("Logged fill: %s %s %s @ %s", trade.side, trade.qty, trade.symbol, trade.fill_price)
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Failed to log trade fill")
    finally:
        db.close()


async def run_execution_logger() -> None:
    """Connect to Alpaca's trade-update stream and log fills until cancelled."""
    stream = make_trading_stream()
    stream.subscribe_trade_updates(_handle_trade_update)
    logger.info("Execution logger connected to Alpaca trade-update stream")
    try:
        await stream._run_forever()
    except asyncio.CancelledError:
        logger.info("Execution logger shutting down")
        await stream.close()
        raise
