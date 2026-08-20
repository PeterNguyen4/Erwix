"""Auto-logs order intent and lifecycle/fills into the `trades` table.

`log_order_intent` is called right after an order is submitted
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
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.alpaca_client import (
    get_recent_filled_orders,
    trading_client_for_token,
    trading_stream_for_token,
    user_id_from_client_order_id,
)
from app.db import SessionLocal
from app.models import AlpacaAccount, Trade
from app.schemas import OrderRequest, OrderResponse
from app.services.token_crypto import decrypt_token
from app.services.trade_retrieval import embed_trade_best_effort

logger = logging.getLogger("erwix.execution_logger")

_FILL_EVENTS = {"fill", "partial_fill"}
# Lifecycle events worth persisting a status update for. Anything else (e.g.
# "order_replace_rejected") is ignored.
_STATUS_EVENTS = _FILL_EVENTS | {
    "new",
    "canceled",
    "expired",
    "rejected",
    "replaced",
    "done_for_day",
    "stopped",
    "suspended",
    "pending_cancel",
    "pending_replace",
}
_RECONCILE_LOOKBACK = timedelta(days=7)


def _to_float(value, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _fill_only_trade(
    *,
    broker_order_id: str | None,
    client_order_id: str | None,
    symbol: str,
    side: str,
    order_type: str | None,
    qty,
    fill_price,
    status: str,
    filled_at,
    raw,
) -> Trade:
    """Build a fill-only Trade row (no submission-time intent row exists for it) —
    used both when a fill event arrives for an order the logger never saw
    submitted, and when reconciling fills from Alpaca's order history."""
    return Trade(
        broker_order_id=broker_order_id,
        client_order_id=client_order_id,
        user_id=user_id_from_client_order_id(client_order_id),
        symbol=symbol,
        side=side,
        order_type=order_type,
        qty=_to_float(qty),
        fill_price=_to_float(fill_price),
        status=status,
        filled_at=filled_at,
        raw=json.dumps(raw, default=str),
    )


async def log_order_intent(response: OrderResponse, request: OrderRequest, user_id: int) -> None:
    """Log an order the instant it's accepted by Alpaca, before any fill.

    Writes one row for the entry leg and, for bracket orders, one additional
    row per child leg (take_profit / stop_loss), linked back to the entry via
    parent_client_order_id. Best-effort: never raises, so a logging failure
    can't block order submission from returning to the user.
    """
    async with SessionLocal() as db:
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
            await db.commit()
            logger.info(
                "Logged order intent: %s %s %s (%s, %d leg(s))",
                entry.side,
                entry.qty,
                entry.symbol,
                entry.order_class,
                len(response.legs),
            )
        except Exception:
            await db.rollback()
            logger.exception("Failed to log order intent")


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
    status = getattr(
        getattr(order, "status", None),
        "value",
        str(getattr(order, "status", "")) or event,
    )

    async with SessionLocal() as db:
        try:
            trade = None
            if broker_order_id:
                trade = await db.scalar(
                    select(Trade).where(Trade.broker_order_id == broker_order_id)
                )
            if trade is None and client_order_id:
                trade = await db.scalar(
                    select(Trade).where(Trade.client_order_id == client_order_id)
                )

            if trade is None:
                if not is_fill:
                    # No intent row (logger wasn't running at submission time) and
                    # nothing filled yet — nothing worth persisting.
                    return
                filled_at = getattr(order, "filled_at", None) or datetime.now(UTC)
                price = getattr(data, "price", None) or getattr(order, "filled_avg_price", None)
                qty = getattr(data, "qty", None) or getattr(order, "filled_qty", None)
                trade = _fill_only_trade(
                    broker_order_id=broker_order_id,
                    client_order_id=client_order_id,
                    symbol=getattr(order, "symbol", ""),
                    side=getattr(
                        getattr(order, "side", None),
                        "value",
                        str(getattr(order, "side", "")),
                    ),
                    order_type=getattr(
                        getattr(order, "order_type", None),
                        "value",
                        str(getattr(order, "order_type", "")) or None,
                    ),
                    qty=qty,
                    fill_price=price,
                    status=status,
                    filled_at=filled_at,
                    raw=data,
                )
                db.add(trade)
            else:
                trade.status = status
                if is_fill:
                    trade.filled_at = getattr(order, "filled_at", None) or datetime.now(UTC)
                    price = getattr(data, "price", None) or getattr(order, "filled_avg_price", None)
                    qty = getattr(data, "qty", None) or getattr(order, "filled_qty", None)
                    trade.fill_price = _to_float(price)
                    trade.qty = _to_float(qty, trade.qty)
                trade.raw = json.dumps(data, default=str)

            await db.commit()
            logger.info("Logged %s: %s %s %s", event, trade.side, trade.qty, trade.symbol)
            if is_fill:
                await embed_trade_best_effort(db, trade)
        except Exception:
            await db.rollback()
            logger.exception("Failed to log trade update")


async def _reconcile_account_fills(user_id: int, oauth_token: str, env: str) -> None:
    """Backfill fills for a single user."""
    since = datetime.now(UTC) - _RECONCILE_LOOKBACK
    client = trading_client_for_token(oauth_token, env)
    async with SessionLocal() as db:
        try:
            orders = await asyncio.to_thread(get_recent_filled_orders, since, client)
            if not orders:
                return
            existing = {
                t.broker_order_id: t
                for t in (
                    await db.scalars(
                        select(Trade).where(Trade.broker_order_id.in_([str(o.id) for o in orders]))
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
                trade = _fill_only_trade(
                    broker_order_id=broker_order_id,
                    client_order_id=o.client_order_id,
                    symbol=o.symbol,
                    side=getattr(o.side, "value", str(o.side)),
                    order_type=getattr(o.order_type, "value", str(o.order_type))
                    if o.order_type
                    else None,
                    qty=o.filled_qty,
                    fill_price=o.filled_avg_price,
                    status="filled",
                    filled_at=o.filled_at,
                    raw=o,
                )
                db.add(trade)
                added += 1
            if added or updated:
                await db.commit()
                logger.info(
                    "Reconciled fills: %d added, %d updated from Alpaca order history",
                    added,
                    updated,
                )
        except Exception:
            await db.rollback()
            logger.exception("Fill reconciliation failed")


async def _linked_accounts() -> list[AlpacaAccount]:
    async with SessionLocal() as db:
        return list((await db.scalars(select(AlpacaAccount))).all())


async def reconcile_recent_fills() -> None:
    """Backfill fills for every linked account."""
    for account in await _linked_accounts():
        try:
            token = decrypt_token(account.access_token)
        except ValueError:
            logger.exception("Failed to decrypt Alpaca token for user %s", account.user_id)
            continue
        await _reconcile_account_fills(account.user_id, token, account.env)


# One live trade-update stream per linked user, keyed by user_id.
_user_stream_tasks: dict[int, asyncio.Task] = {}


async def _run_user_stream(user_id: int, oauth_token: str, env: str) -> None:
    stream = trading_stream_for_token(oauth_token, env)
    stream.subscribe_trade_updates(_handle_trade_update)
    logger.info("Execution logger connected to Alpaca trade-update stream for user %s", user_id)
    try:
        await stream._run_forever()
    except asyncio.CancelledError:
        await stream.close()
        raise
    except Exception:
        logger.exception("Execution logger stream for user %s crashed", user_id)


def start_user_stream(user_id: int, oauth_token: str, env: str) -> None:
    """Start/restart the trade-update stream for one linked user."""
    existing = _user_stream_tasks.get(user_id)
    if existing is not None and not existing.done():
        existing.cancel()
    _user_stream_tasks[user_id] = asyncio.create_task(_run_user_stream(user_id, oauth_token, env))


async def stop_user_stream(user_id: int) -> None:
    """Stop the trade-update stream for one user."""
    task = _user_stream_tasks.pop(user_id, None)
    if task is None:
        return
    task.cancel()
    try:
        await task
    except (asyncio.CancelledError, Exception):
        pass


async def start_all_user_streams() -> None:
    """Start a trade-update stream for every linked account."""
    for account in await _linked_accounts():
        try:
            token = decrypt_token(account.access_token)
        except ValueError:
            logger.exception("Failed to decrypt Alpaca token for user %s", account.user_id)
            continue
        start_user_stream(account.user_id, token, account.env)


async def stop_all_user_streams() -> None:
    tasks = list(_user_stream_tasks.values())
    _user_stream_tasks.clear()
    for task in tasks:
        task.cancel()
    for task in tasks:
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
