import asyncio
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.auth import get_current_user_id
from app.db import get_db
from app.models import DebriefMessage, DebriefReport, UserPreference
from app.schemas import (
    AgentReviewRequest,
    AgentReviewResponse,
    DebriefMessageIn,
    DebriefMessageOut,
    DebriefReportOut,
    DebriefStatus,
)
from app.config import get_settings
from app.services.agent_graph import arun_followup, astream_review, exit_guidance, run_review
from app.services.debrief_jobs import create_pending_report, run_debrief_job_by_id
from app.services import live_feed
from app.services.rule_engine import evaluate_rules, price_level_signal, rules_just_fired
from app.services.rule_watch import ENTRY_COLOR, EXIT_COLOR, load_rule_set
from app.services.trade_retrieval import count_trades_since

logger = logging.getLogger("entro.agent")

router = APIRouter(prefix="/api/agent", tags=["agent"])

DEFAULT_LOOKBACK = timedelta(days=30)


def _report_out(report: DebriefReport) -> DebriefReportOut:
    eta = None
    if report.status in ("pending", "running") and report.total_steps:
        remaining = max(report.total_steps - report.current_step, 0)
        eta = remaining * get_settings().debrief_step_estimate_seconds
    return DebriefReportOut(
        id=report.id,
        status=report.status,
        window_start=report.window_start,
        window_end=report.window_end,
        symbol=report.symbol,
        scheduled_for=report.scheduled_for,
        started_at=report.started_at,
        completed_at=report.completed_at,
        total_steps=report.total_steps,
        current_step=report.current_step,
        eta_seconds=eta,
        steps=report.steps,
        error_detail=report.error_detail,
    )


@router.post("/review", response_model=AgentReviewResponse)
async def review_trades(
    body: AgentReviewRequest,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> AgentReviewResponse:
    """Run the LangGraph analyst over a trade window and return a narrative
    plus chart annotations. Pass `query` to also pull semantically similar
    past trades into context (e.g. 'trades where I panicked')."""
    try:
        narrative, annotations = await run_review(
            db, user_id, body.from_, body.to, symbol=body.symbol, query=body.query
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AgentReviewResponse(narrative=narrative, annotations=annotations)


@router.get("/status", response_model=DebriefStatus)
async def debrief_status(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefStatus:
    """Whether the user has fills since their last debrief, for the sidebar badge."""
    pref = await db.get(UserPreference, user_id)
    last_debrief_at = pref.last_debrief_at if pref else None
    since = last_debrief_at or (datetime.now(timezone.utc) - DEFAULT_LOOKBACK)
    count = await count_trades_since(db, user_id, since)
    return DebriefStatus(has_new_trades=count > 0, new_trade_count=count, last_debrief_at=last_debrief_at)


@router.post("/debrief/reset", response_model=DebriefStatus)
async def reset_debrief(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefStatus:
    """Dev helper: clears last_debrief_at so a debrief can be rerun without waiting
    for new fills. Not linked from any production UI path."""
    pref = await db.get(UserPreference, user_id)
    if pref:
        pref.last_debrief_at = None
        await db.commit()
    return await debrief_status(db, user_id)


@router.websocket("/debrief")
async def debrief(
    websocket: WebSocket,
    from_: datetime = Query(..., alias="from"),
    to: datetime = Query(...),
    symbol: str | None = Query(None),
    query: str | None = Query(None),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Stream the LangGraph analyst's debrief: token/annotations/spotlight/done events."""
    await websocket.accept()
    try:
        async for event in astream_review(db, user_id, from_, to, symbol=symbol, query=query):
            await websocket.send_json(event)

        pref = await db.get(UserPreference, user_id)
        if pref is None:
            pref = UserPreference(user_id=user_id)
            db.add(pref)
        pref.last_debrief_at = datetime.now(timezone.utc)
        await db.commit()
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("debrief stream failed for user %s", user_id)
        try:
            await websocket.send_json({"type": "error", "detail": "debrief failed"})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


@router.websocket("/watch/{symbol}")
async def watch(
    websocket: WebSocket,
    symbol: str,
    timeframe: str = Query("1Day"),
    refresh_seconds: int = Query(30, ge=10, le=300),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Real-time evaluation of the user's compiled strategy rules plus,
    independently, stop-loss/take-profit awareness for whatever bracket the
    client currently has active (pre-trade draft or an open position) — no LLM
    call in the loop, just evaluate_rules()/price_level_signal() re-run on the
    latest price.

    Driven by Alpaca's live quote stream (via `live_feed`, which fans out a
    single alpaca-py subscription per symbol so this doesn't collide with the
    chart's own `WS /api/market/stream/{symbol}` subscription on the same
    symbol) rather than REST polling: each quote tick updates the in-memory
    candle series' latest close/high/low and re-evaluates immediately, so a
    signal reaches the client within roughly one tick instead of waiting out a
    poll interval. The historical candle series is still refetched via REST
    every `refresh_seconds` as a correctness backstop (new bars land, indicator
    windows stay accurate) — that timer no longer gates signal latency.

    Emits a `signal` event only on a transition (rules_just_fired for
    indicator crosses, edge-triggering on change for level breaches) so an
    already-true condition at connect time doesn't immediately fire.

    The client pushes/updates bracket levels by sending
    `{"type": "set_levels", "entry_price", "stop_loss_price", "take_profit_price"}`
    over the same socket at any time — in particular while the trader is
    dragging the TP/SL lines on the chart — so evaluation always uses the
    latest values without needing to reconnect."""
    symbol = symbol.upper()
    await websocket.accept()

    if not alpaca_client.is_stream_available():
        await websocket.send_json({"type": "error", "detail": "live stream unavailable"})
        await websocket.close()
        return

    rule_set = await load_rule_set(db, user_id)
    rules = (
        [(r, "entry") for r in rule_set.entry_rules] + [(r, "exit") for r in rule_set.exit_rules]
        if rule_set is not None
        else []
    )
    all_rules = [r for r, _ in rules]

    levels: dict[str, float | None] = {
        "entry_price": None,
        "stop_loss_price": None,
        "take_profit_price": None,
    }
    try:
        open_levels = alpaca_client.get_open_bracket_levels(symbol, user_id)
    except Exception:  # noqa: BLE001
        logger.exception("failed to seed levels from open position for user %s symbol %s", user_id, symbol)
        open_levels = None
    if open_levels:
        levels.update(open_levels)

    candles = alpaca_client.get_candles(symbol, timeframe)
    was_firing = evaluate_rules(candles, all_rules) if all_rules else []
    was_level_hit: str | None = None

    tick_queue: asyncio.Queue = asyncio.Queue()

    async def on_quote(q) -> None:
        mid = None
        if q.bid_price and q.ask_price:
            mid = (q.bid_price + q.ask_price) / 2
        elif q.ask_price or q.bid_price:
            mid = q.ask_price or q.bid_price
        if mid is not None:
            await tick_queue.put(mid)

    live_feed.subscribe_quotes(symbol, on_quote)

    async def receive_levels() -> None:
        try:
            while True:
                msg = await websocket.receive_json()
                if msg.get("type") == "set_levels":
                    levels["entry_price"] = msg.get("entry_price")
                    levels["stop_loss_price"] = msg.get("stop_loss_price")
                    levels["take_profit_price"] = msg.get("take_profit_price")
                    if candles:
                        await tick_queue.put(candles[-1].close)
        except (WebSocketDisconnect, RuntimeError):
            pass

    async def refresh_candles() -> None:
        nonlocal candles
        while True:
            await asyncio.sleep(refresh_seconds)
            try:
                fresh = alpaca_client.get_candles(symbol, timeframe)
            except Exception:  # noqa: BLE001
                continue
            if fresh:
                candles = fresh

    receiver_task = asyncio.create_task(receive_levels())
    refresh_task = asyncio.create_task(refresh_candles())

    try:
        while True:
            price = await tick_queue.get()
            if not candles:
                continue
            candles[-1] = candles[-1].model_copy(update={
                "close": price,
                "high": max(candles[-1].high, price),
                "low": min(candles[-1].low, price),
            })
            candle = candles[-1]

            if all_rules:
                now_firing = evaluate_rules(candles, all_rules)
                for i in rules_just_fired(was_firing, now_firing):
                    rule, kind = rules[i]
                    await websocket.send_json({
                        "type": "signal",
                        "kind": kind,
                        "description": rule.description,
                        "annotation": {
                            "type": "marker",
                            "time": candle.time,
                            "price": candle.close,
                            "label": rule.description,
                            "color": ENTRY_COLOR if kind == "entry" else EXIT_COLOR,
                        },
                    })
                was_firing = now_firing

            level_hit = price_level_signal(
                candle.close,
                levels["entry_price"],
                levels["stop_loss_price"],
                levels["take_profit_price"],
            )
            if level_hit and level_hit != was_level_hit:
                static_description = (
                    "Take-profit target hit — consider closing the position"
                    if level_hit == "take_profit"
                    else "Stop-loss hit — consider exiting to limit further loss"
                )
                try:
                    description = await exit_guidance(
                        db,
                        user_id,
                        symbol,
                        level_hit,
                        candle.close,
                        levels["entry_price"],
                        levels["stop_loss_price"],
                        levels["take_profit_price"],
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("exit guidance narration failed for user %s symbol %s", user_id, symbol)
                    description = static_description
                await websocket.send_json({
                    "type": "signal",
                    "kind": "exit",
                    "description": description,
                    "annotation": {
                        "type": "marker",
                        "time": candle.time,
                        "price": candle.close,
                        "label": description,
                        "color": EXIT_COLOR,
                    },
                })
            was_level_hit = level_hit
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("rule watch loop failed for user %s symbol %s", user_id, symbol)
        try:
            await websocket.send_json({"type": "error", "detail": "watch loop failed"})
        except Exception:  # noqa: BLE001
            pass
    finally:
        live_feed.unsubscribe_quotes(symbol, on_quote)
        for task in (receiver_task, refresh_task):
            task.cancel()
        for task in (receiver_task, refresh_task):
            try:
                await task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass


@router.post("/debrief/generate", response_model=DebriefReportOut)
async def generate_debrief_now(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefReportOut:
    """Dev/manual trigger: creates (or returns the already in-flight)
    DebriefReport for the current window and starts generation immediately,
    bypassing the day/time schedule. Generation continues in the background —
    poll GET /api/agent/debrief/latest for progress/ETA, same as the scheduled path."""
    report = await create_pending_report(db, user_id)
    if report.status == "pending":
        asyncio.create_task(run_debrief_job_by_id(report.id))
    return _report_out(report)


@router.get("/debrief/latest", response_model=DebriefReportOut | None)
async def latest_debrief_report(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefReportOut | None:
    """Most recent background-generated DebriefReport for the sidebar/banner:
    pending/running (with an ETA) while cooking, ready once done."""
    report = await db.scalar(
        select(DebriefReport)
        .where(DebriefReport.user_id == user_id)
        .order_by(DebriefReport.scheduled_for.desc())
        .limit(1)
    )
    return _report_out(report) if report else None


@router.get("/debrief/{report_id}", response_model=DebriefReportOut)
async def get_debrief_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefReportOut:
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="report not found")
    return _report_out(report)


@router.get("/debrief/{report_id}/messages", response_model=list[DebriefMessageOut])
async def list_debrief_messages(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[DebriefMessage]:
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="report not found")
    return list(
        (
            await db.scalars(
                select(DebriefMessage)
                .where(DebriefMessage.report_id == report_id)
                .order_by(DebriefMessage.created_at.asc())
            )
        ).all()
    )


@router.post("/debrief/{report_id}/messages", response_model=DebriefMessageOut)
async def post_debrief_message(
    report_id: int,
    body: DebriefMessageIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefMessage:
    """Ask a follow-up question about a completed DebriefReport. Grounded in the
    same trade window/retrieval context used to generate the report (re-fetched,
    not just the stored narrative) — see agent_graph.arun_followup."""
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="report not found")
    if report.status != "ready":
        raise HTTPException(status_code=409, detail="report is not ready yet")

    prior = list(
        (
            await db.scalars(
                select(DebriefMessage)
                .where(DebriefMessage.report_id == report_id)
                .order_by(DebriefMessage.created_at.asc())
            )
        ).all()
    )
    history = [(m.role, m.content) for m in prior]
    narrative = "\n\n".join(step.get("narrative", "") for step in report.steps)

    user_message = DebriefMessage(report_id=report_id, role="user", content=body.message)
    db.add(user_message)
    await db.commit()

    try:
        reply, _events = await arun_followup(
            db, user_id, report.window_start, report.window_end, narrative, history, body.message,
            symbol=report.symbol, query=report.query,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    assistant_message = DebriefMessage(report_id=report_id, role="assistant", content=reply)
    db.add(assistant_message)
    await db.commit()
    return assistant_message
