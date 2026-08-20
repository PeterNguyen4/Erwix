import asyncio
import json
import logging
from datetime import UTC, datetime, timedelta

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.auth import get_current_user_id, require_admin
from app.config import get_settings
from app.db import get_db
from app.dependencies.guardrails import (
    check_ws_guardrail_input,
    guardrail_input_or_raise,
)
from app.dependencies.rate_limit import check_ws_rate_limit, rate_limit
from app.models import DebriefMessage, DebriefReport, UserPreference
from app.schemas import (
    AgentReviewRequest,
    AgentReviewResponse,
    AttachedReferenceIn,
    DebriefAskIn,
    DebriefMessageOut,
    DebriefReportOut,
    DebriefSessionOut,
    DebriefSessionRenameIn,
    DebriefStatus,
)
from app.services import live_feed
from app.services.agent_graph import (
    arun_ask,
    astream_ask,
    astream_review,
    exit_guidance,
    run_review,
)
from app.services.alpaca_accounts import get_linked_client
from app.services.debrief_jobs import create_pending_report, run_debrief_job_by_id
from app.services.guardrails import scan_output
from app.services.reference_resolver import resolve_references
from app.services.rule_engine import (
    evaluate_rules,
    rules_just_fired,
    signal_price_level,
)
from app.services.rule_watch import ENTRY_COLOR, EXIT_COLOR, load_rule_set
from app.services.trade_retrieval import count_trades_since

logger = logging.getLogger("erwix.agent")

router = APIRouter(prefix="/api/agent", tags=["agent"])

DEFAULT_LOOKBACK = timedelta(days=30)

_llm_rate_limit = rate_limit("agent-llm", limit=10, window_ms=60_000, fail_open=False)


def _report_out(report: DebriefReport) -> DebriefReportOut:
    eta = None
    if report.status in ("pending", "running") and report.total_steps:
        remaining = max(report.total_steps - report.current_step, 0)
        eta = remaining * get_settings().debrief_step_estimate_seconds
    return DebriefReportOut(
        id=report.id,
        report_type=report.report_type,
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
        summary=report.summary,
        viewed_at=report.viewed_at,
        error_detail=report.error_detail,
    )


@router.post(
    "/review",
    response_model=AgentReviewResponse,
    dependencies=[Depends(_llm_rate_limit)],
)
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
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    last_debrief_at = pref.last_debrief_at if pref else None
    since = last_debrief_at or (datetime.now(UTC) - DEFAULT_LOOKBACK)
    count = await count_trades_since(db, user_id, since)
    return DebriefStatus(
        has_new_trades=count > 0, new_trade_count=count, last_debrief_at=last_debrief_at
    )


@router.post("/debrief/reset", response_model=DebriefStatus)
async def reset_debrief(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(require_admin),
) -> DebriefStatus:
    """Dev helper: clears last_debrief_at so a debrief can be rerun without waiting
    for new fills. Not linked from any production UI path."""
    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
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

    rate_limit_error = await check_ws_rate_limit(
        user_id, "agent-llm", limit=10, window_ms=60_000, fail_open=False
    )
    if rate_limit_error:
        await websocket.send_json({"type": "error", "detail": rate_limit_error})
        await websocket.close(code=1008)
        return

    if query:
        guardrail_error = await check_ws_guardrail_input(query)
        if guardrail_error:
            await websocket.send_json({"type": "error", "detail": guardrail_error})
            await websocket.close(code=1008)
            return

    try:
        async for event in astream_review(db, user_id, from_, to, symbol=symbol, query=query):
            await websocket.send_json(event)

        pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
        if pref is None:
            pref = UserPreference(user_id=user_id)
            db.add(pref)
        pref.last_debrief_at = datetime.now(UTC)
        await db.commit()
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
    except WebSocketDisconnect:
        pass
    except Exception:
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
    """Live quotes from Alpaca paired with rule evaluation."""
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
        linked_client = await get_linked_client(db, user_id)
        open_levels = (
            await asyncio.to_thread(
                alpaca_client.get_open_bracket_levels, symbol, user_id, linked_client
            )
            if linked_client is not None
            else None
        )
    except Exception:
        logger.exception(
            "failed to seed levels from open position for user %s symbol %s",
            user_id,
            symbol,
        )
        open_levels = None
    if open_levels:
        levels.update(open_levels)

    candles = await asyncio.to_thread(alpaca_client.get_candles, symbol, timeframe)
    was_firing = evaluate_rules(candles, all_rules) if all_rules else []
    was_level_hit: str | None = None

    tick_queue: asyncio.Queue = asyncio.Queue()

    async def on_quote(q) -> None:
        mid = alpaca_client.sanitized_mid_price(q.bid_price, q.ask_price)
        if mid is not None:
            await tick_queue.put(mid)

    await asyncio.to_thread(live_feed.subscribe_quotes, symbol, on_quote)

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
                fresh = await asyncio.to_thread(alpaca_client.get_candles, symbol, timeframe)
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
            candles[-1] = candles[-1].model_copy(
                update={
                    "close": price,
                    "high": max(candles[-1].high, price),
                    "low": min(candles[-1].low, price),
                }
            )
            candle = candles[-1]

            if all_rules:
                now_firing = evaluate_rules(candles, all_rules)
                for i in rules_just_fired(was_firing, now_firing):
                    rule, kind = rules[i]
                    await websocket.send_json(
                        {
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
                        }
                    )
                was_firing = now_firing

            level_hit = signal_price_level(
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
                except Exception:
                    logger.exception(
                        "exit guidance narration failed for user %s symbol %s",
                        user_id,
                        symbol,
                    )
                    description = static_description
                await websocket.send_json(
                    {
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
                    }
                )
            was_level_hit = level_hit
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("rule watch loop failed for user %s symbol %s", user_id, symbol)
        try:
            await websocket.send_json({"type": "error", "detail": "watch loop failed"})
        except Exception:  # noqa: BLE001
            pass
    finally:
        await asyncio.to_thread(live_feed.unsubscribe_quotes, symbol, on_quote)
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


@router.post(
    "/debrief/generate",
    response_model=DebriefReportOut,
    dependencies=[Depends(_llm_rate_limit)],
)
async def generate_debrief_now(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(require_admin),
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


@router.get("/debrief/sessions", response_model=list[DebriefSessionOut])
async def list_debrief_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[dict]:
    """Display all chat sessions."""
    reports = (
        await db.scalars(
            select(DebriefReport)
            .where(DebriefReport.user_id == user_id, DebriefReport.report_type == "ask")
            .order_by(DebriefReport.created_at.desc())
        )
    ).all()
    sessions = []
    for report in reports:
        if report.query:
            title = report.query
        else:
            first_message = await db.scalar(
                select(DebriefMessage.content)
                .where(DebriefMessage.report_id == report.id, DebriefMessage.role == "user")
                .order_by(DebriefMessage.created_at.asc())
                .limit(1)
            )
            title = (first_message or "New chat")[:80]
        sessions.append({"id": report.id, "created_at": report.created_at, "title": title})
    return sessions


@router.post("/debrief/sessions", response_model=DebriefSessionOut)
async def create_debrief_session(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    """Create new session on clear."""
    now = datetime.now(UTC)
    report = DebriefReport(
        user_id=user_id, report_type="ask", status="ready", scheduled_for=now, steps=[]
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return {"id": report.id, "created_at": report.created_at, "title": "New chat"}


@router.patch("/debrief/sessions/{report_id}", response_model=DebriefSessionOut)
async def rename_debrief_session(
    report_id: int,
    body: DebriefSessionRenameIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id or report.report_type != "ask":
        raise HTTPException(status_code=404, detail="session not found")
    report.query = body.title.strip()[:80] or None
    await db.commit()
    return {
        "id": report.id,
        "created_at": report.created_at,
        "title": report.query or "New chat",
    }


@router.delete("/debrief/{report_id}", status_code=204)
async def delete_debrief_session(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """Clear debrief chat session."""
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id or report.report_type != "ask":
        raise HTTPException(status_code=404, detail="session not found")
    await db.execute(delete(DebriefMessage).where(DebriefMessage.report_id == report_id))
    await db.delete(report)
    await db.commit()


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


@router.post("/debrief/{report_id}/viewed", response_model=DebriefReportOut)
async def mark_debrief_viewed(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefReportOut:
    """Marks debrief to show summary instead."""
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="report not found")
    if report.viewed_at is None:
        report.viewed_at = datetime.now(UTC)
        await db.commit()
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


@router.delete("/debrief/{report_id}/messages", status_code=204)
async def clear_debrief_messages(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """The `/clear` chat command: wipes a conversation's follow-up messages so the
    next question starts with no prior history. Leaves the DebriefReport itself
    (and, for a scheduled report, its generated steps/narrative) intact — only
    the chat thread on top of it is cleared."""
    report = await db.get(DebriefReport, report_id)
    if report is None or report.user_id != user_id:
        raise HTTPException(status_code=404, detail="report not found")
    await db.execute(delete(DebriefMessage).where(DebriefMessage.report_id == report_id))
    await db.commit()


async def _resolve_ask_report(
    db: AsyncSession, user_id: int, report_id: int | None
) -> tuple[DebriefReport, str | None]:
    """Ground questions in debrief chat window."""
    if report_id is not None:
        report = await db.get(DebriefReport, report_id)
        if report is None or report.user_id != user_id:
            raise ValueError("conversation not found")
        if report.report_type != "scheduled":
            return report, None
        if report.status != "ready":
            raise ValueError("report is not ready yet")
        narrative = "\n\n".join(step.get("narrative", "") for step in report.steps)
        window_context = (
            f"This conversation started as a debrief of trades from {report.window_start:%Y-%m-%d} "
            f"to {report.window_end:%Y-%m-%d}"
            f"{f' (symbol {report.symbol})' if report.symbol else ''}:\n{narrative}"
        )
        return report, window_context

    now = datetime.now(UTC)
    report = DebriefReport(
        user_id=user_id, report_type="ask", status="ready", scheduled_for=now, steps=[]
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)
    return report, None


async def _debrief_history(db: AsyncSession, report_id: int) -> list[tuple[str, str]]:
    prior = list(
        (
            await db.scalars(
                select(DebriefMessage)
                .where(DebriefMessage.report_id == report_id)
                .order_by(DebriefMessage.created_at.asc())
            )
        ).all()
    )
    return [(m.role, m.content) for m in prior]


@router.post(
    "/debrief/ask",
    response_model=DebriefMessageOut,
    dependencies=[Depends(_llm_rate_limit)],
)
async def ask_debrief(
    body: DebriefAskIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> DebriefMessage:
    guardrail_input_or_raise(body.message)

    try:
        report, window_context = await _resolve_ask_report(db, user_id, body.report_id)
    except ValueError as exc:
        detail = str(exc)
        raise HTTPException(
            status_code=409 if "not ready" in detail else 404, detail=detail
        ) from exc

    history = await _debrief_history(db, report.id)

    user_message = DebriefMessage(report_id=report.id, role="user", content=body.message)
    db.add(user_message)
    await db.commit()

    attached_context = await resolve_references(db, user_id, body.references)
    if window_context:
        attached_context = [window_context, *attached_context]

    try:
        reply, _annotations, provenance = await arun_ask(
            db,
            user_id,
            body.message,
            history=history,
            attached_context=attached_context,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    output_violation = scan_output(reply)
    if output_violation:
        logger.warning("output guardrail triggered in ask_debrief: %s", output_violation)
        raise HTTPException(status_code=502, detail=output_violation)

    assistant_message = DebriefMessage(
        report_id=report.id, role="assistant", content=reply, tool_provenance=provenance
    )
    db.add(assistant_message)
    await db.commit()
    return assistant_message


@router.websocket("/debrief/ask/stream")
async def ask_debrief_stream(
    websocket: WebSocket,
    message: str = Query(...),
    report_id: int | None = Query(None),
    references: str = Query("[]"),
    user_id: int = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Conversation with streaming."""
    await websocket.accept()

    rate_limit_error = await check_ws_rate_limit(
        user_id, "agent-llm", limit=10, window_ms=60_000, fail_open=False
    )
    if rate_limit_error:
        await websocket.send_json({"type": "error", "detail": rate_limit_error})
        await websocket.close(code=1008)
        return

    guardrail_error = await check_ws_guardrail_input(message)
    if guardrail_error:
        await websocket.send_json({"type": "error", "detail": guardrail_error})
        await websocket.close(code=1008)
        return

    try:
        report, window_context = await _resolve_ask_report(db, user_id, report_id)
    except ValueError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
        await websocket.close()
        return

    await websocket.send_json({"type": "report", "report_id": report.id})

    history = await _debrief_history(db, report.id)

    user_message = DebriefMessage(report_id=report.id, role="user", content=message)
    db.add(user_message)
    await db.commit()

    try:
        parsed_references = [AttachedReferenceIn.model_validate(r) for r in json.loads(references)]
    except (json.JSONDecodeError, ValueError):
        parsed_references = []
    attached_context = await resolve_references(db, user_id, parsed_references)
    if window_context:
        attached_context = [window_context, *attached_context]

    reply_parts: list[str] = []
    provenance: list[dict] = []
    ordered_parts: list[dict] = []

    try:
        async for event in astream_ask(
            db, user_id, message, history=history, attached_context=attached_context
        ):
            if event["type"] == "token":
                reply_parts.append(event["text"])
                if ordered_parts and ordered_parts[-1]["type"] == "text":
                    ordered_parts[-1]["text"] += event["text"]
                else:
                    ordered_parts.append({"type": "text", "text": event["text"]})
            elif event["type"] == "tool_call":
                provenance.append({"tool": event["tool"], "args": event["args"]})
                ordered_parts.append(
                    {"type": "tool_call", "tool": event["tool"], "args": event["args"]}
                )
            await websocket.send_json(event)

        full_reply = "".join(reply_parts)
        output_violation = scan_output(full_reply)
        if output_violation:
            logger.warning("output guardrail triggered in ask_debrief_stream: %s", output_violation)

        assistant_message = DebriefMessage(
            report_id=report.id,
            role="assistant",
            content=full_reply,
            tool_provenance=provenance,
            parts=ordered_parts,
        )
        db.add(assistant_message)
        await db.commit()
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("debrief ask stream failed for user %s", user_id)
        try:
            await websocket.send_json({"type": "error", "detail": "ask failed"})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
