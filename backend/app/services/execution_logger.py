"""Auto-logs every fill reported by Alpaca into the `trades` table.

Runs as a background task started in the FastAPI lifespan. On each
trade-update event with status 'fill' / 'partial_fill' it persists a Trade row,
which is the data the Phase-2 analyst agent reviews over a window.
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone

from app.alpaca_client import (
    get_recent_filled_orders,
    make_trading_stream,
    user_id_from_client_order_id,
)
from app.db import SessionLocal
from app.models import Trade
from sqlalchemy import select

logger = logging.getLogger("entro.execution_logger")

_FILL_EVENTS = {"fill", "partial_fill"}
_RECONCILE_LOOKBACK = timedelta(days=7)


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


def reconcile_recent_fills() -> None:
    """Backfill any fills Alpaca reports that we don't already have a Trade row
    for. Covers gaps where the live stream missed an event (e.g. backend was
    down or reconnecting when the fill happened)."""
    since = datetime.now(timezone.utc) - _RECONCILE_LOOKBACK
    db = SessionLocal()
    try:
        orders = get_recent_filled_orders(since)
        if not orders:
            return
        existing_ids = set(
            db.scalars(
                select(Trade.broker_order_id).where(
                    Trade.broker_order_id.in_([str(o.id) for o in orders])
                )
            ).all()
        )
        added = 0
        for o in orders:
            broker_order_id = str(o.id)
            if broker_order_id in existing_ids:
                continue
            trade = Trade(
                broker_order_id=broker_order_id,
                client_order_id=o.client_order_id,
                user_id=user_id_from_client_order_id(o.client_order_id),
                symbol=o.symbol,
                side=getattr(o.side, "value", str(o.side)),
                order_type=getattr(o.order_type, "value", str(o.order_type)) if o.order_type else None,
                qty=_to_float(o.filled_qty),
                fill_price=_to_float(o.filled_avg_price),
                fees=0.0,
                filled_at=o.filled_at,
                raw=json.dumps(o, default=str),
            )
            db.add(trade)
            added += 1
        if added:
            db.commit()
            logger.info("Reconciled %d missed fill(s) from Alpaca order history", added)
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Fill reconciliation failed")
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
