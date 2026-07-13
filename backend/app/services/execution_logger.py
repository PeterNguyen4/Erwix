"""Auto-logs order intent and lifecycle/fills into the `trades` table.

`log_order_intent` is called synchronously right after an order is submitted
(app.routers.trading), writing a Trade row per leg (entry, plus take_profit/
stop_loss for bracket orders) with status="new" before any fill happens.

The background task started in the FastAPI lifespan then updates those rows
in place as Alpaca's trade-update stream reports further events (new,
partial_fill, fill, canceled, expired, rejected, replaced, ...). If a fill
arrives for an order we have no intent row for (e.g. the logger restarted
between submission and fill), it falls back to inserting a fill-only row, as
before.
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
from app.schemas import OrderRequest, OrderResponse
from app.services.trade_retrieval import embed_trade
from sqlalchemy import select

logger = logging.getLogger("entro.execution_logger")

_FILL_EVENTS = {"fill", "partial_fill"}
# Lifecycle events worth persisting a status update for. Anything else (e.g.
# "order_replace_rejected") is ignored.
_STATUS_EVENTS = _FILL_EVENTS | {
    "new", "canceled", "expired", "rejected", "replaced", "done_for_day",
    "stopped", "suspended", "pending_cancel", "pending_replace",
}
_RECONCILE_LOOKBACK = timedelta(days=7)


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def log_order_intent(response: OrderResponse, request: OrderRequest, user_id: str) -> None:
    """Log an order the instant it's accepted by Alpaca, before any fill.

    Writes one row for the entry leg and, for bracket orders, one additional
    row per child leg (take_profit / stop_loss), linked back to the entry via
    parent_client_order_id. Best-effort: never raises, so a logging failure
    can't block order submission from returning to the user.
    """
    db = SessionLocal()
    try:
        entry = Trade(
            broker_order_id=response.id,
            client_order_id=response.client_order_id,
            user_id=user_id,
            symbol=response.symbol,
            side=response.side,
            order_type=response.type,
            qty=response.qty,
            status=response.status,
            order_class=response.order_class,
            limit_price=request.limit_price,
            take_profit_price=request.take_profit_price,
            stop_loss_price=request.stop_loss_price,
            raw=json.dumps(response.model_dump(), default=str),
        )
        db.add(entry)
        for leg in response.legs:
            db.add(
                Trade(
                    broker_order_id=leg.id,
                    client_order_id=leg.client_order_id,
                    parent_client_order_id=response.client_order_id,
                    user_id=user_id,
                    symbol=response.symbol,
                    side=leg.side,
                    order_type=leg.type,
                    qty=response.qty,
                    status="new",
                    order_class=response.order_class,
                    leg="take_profit" if leg.type == "limit" else "stop_loss",
                    limit_price=leg.limit_price,
                    stop_price=leg.stop_price,
                    raw=json.dumps(leg.model_dump(), default=str),
                )
            )
        db.commit()
        logger.info(
            "Logged order intent: %s %s %s (%s, %d leg(s))",
            entry.side, entry.qty, entry.symbol, entry.order_class, len(response.legs),
        )
    except Exception:  # noqa: BLE001 — never block order submission
        db.rollback()
        logger.exception("Failed to log order intent")
    finally:
        db.close()


async def _handle_trade_update(data) -> None:
    """alpaca TradeUpdate handler."""
    event = getattr(data, "event", None)
    if event not in _STATUS_EVENTS:
        return

    order = getattr(data, "order", None)
    if order is None:
        return

    is_fill = event in _FILL_EVENTS
    broker_order_id = str(getattr(order, "id", "") or "") or None
    client_order_id = getattr(order, "client_order_id", None)
    status = getattr(getattr(order, "status", None), "value", str(getattr(order, "status", "")) or event)

    db = SessionLocal()
    try:
        trade = None
        if broker_order_id:
            trade = db.scalar(select(Trade).where(Trade.broker_order_id == broker_order_id))
        if trade is None and client_order_id:
            trade = db.scalar(select(Trade).where(Trade.client_order_id == client_order_id))

        if trade is None:
            if not is_fill:
                # No intent row (logger wasn't running at submission time) and
                # nothing filled yet — nothing worth persisting.
                return
            filled_at = getattr(order, "filled_at", None) or datetime.now(timezone.utc)
            price = getattr(data, "price", None) or getattr(order, "filled_avg_price", None)
            qty = getattr(data, "qty", None) or getattr(order, "filled_qty", None)
            trade = Trade(
                broker_order_id=broker_order_id,
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
                status=status,
                filled_at=filled_at,
                raw=json.dumps(data, default=str),
            )
            db.add(trade)
        else:
            trade.status = status
            if is_fill:
                trade.filled_at = getattr(order, "filled_at", None) or datetime.now(timezone.utc)
                price = getattr(data, "price", None) or getattr(order, "filled_avg_price", None)
                qty = getattr(data, "qty", None) or getattr(order, "filled_qty", None)
                trade.fill_price = _to_float(price)
                trade.qty = _to_float(qty, trade.qty)
            trade.raw = json.dumps(data, default=str)

        db.commit()
        logger.info("Logged %s: %s %s %s", event, trade.side, trade.qty, trade.symbol)
        if is_fill:
            try:
                embed_trade(db, trade)
            except Exception:  # noqa: BLE001 — embedding is best-effort, never blocks fill logging
                db.rollback()
                logger.warning("Failed to embed trade %s", trade.id, exc_info=True)
    except Exception:  # noqa: BLE001
        db.rollback()
        logger.exception("Failed to log trade update")
    finally:
        db.close()


def reconcile_recent_fills() -> None:
    """Backfill any fills Alpaca reports that we don't already have logged, and
    update the fill fields on any existing intent row that hasn't caught up
    yet. Covers gaps where the live stream missed an event (e.g. backend was
    down or reconnecting when the fill happened)."""
    since = datetime.now(timezone.utc) - _RECONCILE_LOOKBACK
    db = SessionLocal()
    try:
        orders = get_recent_filled_orders(since)
        if not orders:
            return
        existing = {
            t.broker_order_id: t
            for t in db.scalars(
                select(Trade).where(
                    Trade.broker_order_id.in_([str(o.id) for o in orders])
                )
            ).all()
        }
        added = 0
        updated = 0
        for o in orders:
            broker_order_id = str(o.id)
            trade = existing.get(broker_order_id)
            if trade is not None:
                if trade.status != "filled":
                    trade.status = "filled"
                    trade.fill_price = _to_float(o.filled_avg_price)
                    trade.qty = _to_float(o.filled_qty, trade.qty)
                    trade.filled_at = o.filled_at
                    updated += 1
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
                status="filled",
                filled_at=o.filled_at,
                raw=json.dumps(o, default=str),
            )
            db.add(trade)
            added += 1
        if added or updated:
            db.commit()
            logger.info(
                "Reconciled fills: %d added, %d updated from Alpaca order history", added, updated
            )
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
