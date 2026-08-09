import asyncio
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app import alpaca_client
from app.auth import get_current_user_id
from app.db import get_db
from app.dependencies.guardrails import check_ws_guardrail_input
from app.dependencies.rate_limit import check_ws_rate_limit, rate_limit
from app.error_handling import alpaca_errors
from app.models import BacktestChatSession as BacktestChatSessionModel
from app.models import BacktestConfig as BacktestConfigModel
from app.models import BacktestRun as BacktestRunModel
from app.schemas_backtest import (
    BacktestChatSessionIn,
    BacktestChatSessionOut,
    BacktestChatSessionSummary,
    BacktestConfig,
    BacktestResult,
)
from app.services.backtest_agent import astream_config_chat
from app.services.backtest_engine import run_backtest

logger = logging.getLogger("entro.backtest")

router = APIRouter(prefix="/api/backtest", tags=["backtest"])

_run_rate_limit = rate_limit("backtest-run", limit=20, window_ms=60_000, fail_open=False)

_DEFAULT_CHAT_CONFIG = BacktestConfig(name="Plan", symbol="AAPL", timeframe="1Day")


def _chat_session_out(row: BacktestChatSessionModel) -> BacktestChatSessionOut:
    return BacktestChatSessionOut(
        id=row.id,
        title=row.title,
        config=BacktestConfig(**row.config),
        messages=row.messages,
        input=row.input,
        window_start=row.window_start,
        window_end=row.window_end,
        updated_at=row.updated_at,
    )


def _config_out(row: BacktestConfigModel) -> BacktestConfig:
    return BacktestConfig(id=row.id, name=row.name, symbol=row.symbol, timeframe=row.timeframe, **row.config)


def _run_out(row: BacktestRunModel) -> dict:
    return {
        "id": row.id,
        "config_id": row.config_id,
        "status": row.status,
        "start": row.start,
        "end": row.end,
        "result": row.result,
        "error_detail": row.error_detail,
    }


@router.get("/configs")
async def list_configs(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[BacktestConfig]:
    rows = (
        await db.scalars(select(BacktestConfigModel).where(BacktestConfigModel.user_id == user_id))
    ).all()
    return [_config_out(r) for r in rows]


@router.post("/configs")
async def create_config(
    body: BacktestConfig,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestConfig:
    payload = body.model_dump(exclude={"id", "name", "symbol", "timeframe"})
    row = BacktestConfigModel(
        user_id=user_id, name=body.name, symbol=body.symbol, timeframe=body.timeframe, config=payload
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _config_out(row)


@router.patch("/configs/{config_id}")
async def update_config(
    config_id: int,
    body: BacktestConfig,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestConfig:
    row = await db.get(BacktestConfigModel, config_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="config not found")
    row.name = body.name
    row.symbol = body.symbol
    row.timeframe = body.timeframe
    row.config = body.model_dump(exclude={"id", "name", "symbol", "timeframe"})
    await db.commit()
    await db.refresh(row)
    return _config_out(row)


@router.post("/configs/{config_id}/run", dependencies=[Depends(_run_rate_limit)])
@alpaca_errors(logger)
async def run_config(
    config_id: int,
    start: datetime,
    end: datetime,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    row = await db.get(BacktestConfigModel, config_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="config not found")

    config = _config_out(row)
    candles = await asyncio.to_thread(alpaca_client.get_candles, config.symbol, config.timeframe, start, end)

    run_row = BacktestRunModel(
        user_id=user_id, config_id=config_id, status="running", start=start, end=end
    )
    db.add(run_row)
    await db.commit()
    await db.refresh(run_row)

    try:
        result: BacktestResult = run_backtest(candles, config)
    except Exception as exc:  # noqa: BLE001
        run_row.status = "error"
        run_row.error_detail = str(exc)
        await db.commit()
        raise

    run_row.status = "ready"
    run_row.result = result.model_dump()
    await db.commit()
    await db.refresh(run_row)
    return _run_out(run_row)


@router.get("/runs/{run_id}")
async def get_run(
    run_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    row = await db.get(BacktestRunModel, run_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="run not found")
    return _run_out(row)


@router.get("/chat-sessions")
async def list_chat_sessions(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[BacktestChatSessionSummary]:
    rows = (
        await db.scalars(
            select(BacktestChatSessionModel)
            .where(BacktestChatSessionModel.user_id == user_id)
            .order_by(BacktestChatSessionModel.updated_at.desc())
        )
    ).all()
    return [BacktestChatSessionSummary(id=r.id, title=r.title, updated_at=r.updated_at) for r in rows]


@router.post("/chat-sessions")
async def create_chat_session(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestChatSessionOut:
    row = BacktestChatSessionModel(
        user_id=user_id,
        title="New chat",
        config=_DEFAULT_CHAT_CONFIG.model_dump(),
        messages=[],
        input="",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _chat_session_out(row)


@router.get("/chat-sessions/{session_id}")
async def get_chat_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestChatSessionOut:
    row = await db.get(BacktestChatSessionModel, session_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="session not found")
    return _chat_session_out(row)


@router.put("/chat-sessions/{session_id}")
async def update_chat_session(
    session_id: int,
    body: BacktestChatSessionIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestChatSessionOut:
    """Full-replace autosave — the frontend PUTs its whole working state (config,
    messages, input, window) on every change, same one-shot-replace shape as
    PATCH /configs/{id}."""
    row = await db.get(BacktestChatSessionModel, session_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="session not found")
    row.title = body.title
    row.config = body.config.model_dump()
    row.messages = body.messages
    row.input = body.input
    row.window_start = body.window_start
    row.window_end = body.window_end
    await db.commit()
    await db.refresh(row)
    return _chat_session_out(row)


@router.delete("/chat-sessions/{session_id}", status_code=204)
async def delete_chat_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    row = await db.get(BacktestChatSessionModel, session_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="session not found")
    await db.delete(row)
    await db.commit()


@router.websocket("/chat")
async def backtest_chat(
    websocket: WebSocket,
    message: str = Query(...),
    config: str = Query(...),
    window_start: str | None = Query(None),
    window_end: str | None = Query(None),
    result: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """Stream the config-chat agent's reply: token deltas, then a final config/done event."""
    await websocket.accept()

    rate_limit_error = await check_ws_rate_limit(user_id, "backtest-chat", limit=10, window_ms=60_000, fail_open=False)
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
        current_config = BacktestConfig.model_validate_json(config)
        last_result = BacktestResult.model_validate_json(result) if result else None
        async for event in astream_config_chat(
            db, user_id, current_config, message, window_start, window_end, last_result
        ):
            await websocket.send_json(event)
    except RuntimeError as exc:
        await websocket.send_json({"type": "error", "detail": str(exc)})
    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        logger.exception("backtest chat stream failed for user %s", user_id)
        try:
            await websocket.send_json({"type": "error", "detail": "chat failed"})
        except Exception:  # noqa: BLE001
            pass
    finally:
        try:
            await websocket.close()
        except Exception:  # noqa: BLE001
            pass
