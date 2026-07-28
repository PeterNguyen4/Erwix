import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import alpaca_client
from app.auth import get_current_user_id
from app.db import get_db
from app.error_handling import alpaca_errors
from app.models import BacktestConfig as BacktestConfigModel
from app.models import BacktestRun as BacktestRunModel
from app.schemas_backtest import BacktestConfig, BacktestResult
from app.services.backtest_agent import astream_config_chat
from app.services.backtest_engine import run_backtest

logger = logging.getLogger("entro.backtest")

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


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
def list_configs(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list[BacktestConfig]:
    rows = db.scalars(
        select(BacktestConfigModel).where(BacktestConfigModel.user_id == user_id)
    ).all()
    return [_config_out(r) for r in rows]


@router.post("/configs")
def create_config(
    body: BacktestConfig,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestConfig:
    payload = body.model_dump(exclude={"id", "name", "symbol", "timeframe"})
    row = BacktestConfigModel(
        user_id=user_id, name=body.name, symbol=body.symbol, timeframe=body.timeframe, config=payload
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _config_out(row)


@router.patch("/configs/{config_id}")
def update_config(
    config_id: int,
    body: BacktestConfig,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> BacktestConfig:
    row = db.get(BacktestConfigModel, config_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="config not found")
    row.name = body.name
    row.symbol = body.symbol
    row.timeframe = body.timeframe
    row.config = body.model_dump(exclude={"id", "name", "symbol", "timeframe"})
    db.commit()
    db.refresh(row)
    return _config_out(row)


@router.post("/configs/{config_id}/run")
@alpaca_errors(logger)
def run_config(
    config_id: int,
    start: datetime,
    end: datetime,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    row = db.get(BacktestConfigModel, config_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="config not found")

    config = _config_out(row)
    candles = alpaca_client.get_candles(config.symbol, config.timeframe, start, end)

    run_row = BacktestRunModel(
        user_id=user_id, config_id=config_id, status="running", start=start, end=end
    )
    db.add(run_row)
    db.commit()
    db.refresh(run_row)

    try:
        result: BacktestResult = run_backtest(candles, config)
    except Exception as exc:  # noqa: BLE001
        run_row.status = "error"
        run_row.error_detail = str(exc)
        db.commit()
        raise

    run_row.status = "ready"
    run_row.result = result.model_dump()
    db.commit()
    db.refresh(run_row)
    return _run_out(run_row)


@router.get("/runs/{run_id}")
def get_run(
    run_id: int,
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> dict:
    row = db.get(BacktestRunModel, run_id)
    if row is None or row.user_id != user_id:
        raise HTTPException(status_code=404, detail="run not found")
    return _run_out(row)


@router.websocket("/chat")
async def backtest_chat(
    websocket: WebSocket,
    message: str = Query(...),
    config: str = Query(...),
    user_id: int = Depends(get_current_user_id),
) -> None:
    """Stream the config-chat agent's reply: token deltas, then a final config/done event."""
    await websocket.accept()
    try:
        current_config = BacktestConfig.model_validate_json(config)
        async for event in astream_config_chat(current_config, message):
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
