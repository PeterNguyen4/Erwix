import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth import require_auth, require_ws_auth
from app.db import get_db
from app.models import Trade, UserPreference
from app.schemas import AgentReviewRequest, AgentReviewResponse, DebriefStatus
from app.services.agent_graph import astream_review, run_review

logger = logging.getLogger("entro.agent")

router = APIRouter(prefix="/api/agent", tags=["agent"])

DEFAULT_LOOKBACK = timedelta(days=30)


@router.post("/review", response_model=AgentReviewResponse)
def review_trades(
    body: AgentReviewRequest,
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> AgentReviewResponse:
    """Run the LangGraph analyst over a trade window and return a narrative
    plus chart annotations. Pass `query` to also pull semantically similar
    past trades into context (e.g. 'trades where I panicked')."""
    try:
        narrative, annotations = run_review(
            db, user_id, body.from_, body.to, symbol=body.symbol, query=body.query
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return AgentReviewResponse(narrative=narrative, annotations=annotations)


@router.get("/status", response_model=DebriefStatus)
def debrief_status(
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> DebriefStatus:
    """Whether the user has fills since their last debrief, for the sidebar badge."""
    pref = db.get(UserPreference, user_id)
    last_debrief_at = pref.last_debrief_at if pref else None
    since = last_debrief_at or (datetime.now(timezone.utc) - DEFAULT_LOOKBACK)
    count = db.scalar(
        select(func.count()).select_from(Trade).where(Trade.user_id == user_id, Trade.filled_at > since)
    ) or 0
    return DebriefStatus(has_new_trades=count > 0, new_trade_count=count, last_debrief_at=last_debrief_at)


@router.post("/debrief/reset", response_model=DebriefStatus)
def reset_debrief(
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> DebriefStatus:
    """Dev helper: clears last_debrief_at so a debrief can be rerun without waiting
    for new fills. Not linked from any production UI path."""
    pref = db.get(UserPreference, user_id)
    if pref:
        pref.last_debrief_at = None
        db.commit()
    return debrief_status(db, user_id)


@router.websocket("/debrief")
async def debrief(
    websocket: WebSocket,
    from_: datetime = Query(..., alias="from"),
    to: datetime = Query(...),
    symbol: str | None = Query(None),
    query: str | None = Query(None),
    user_id: str = Depends(require_ws_auth),
    db: Session = Depends(get_db),
) -> None:
    """Stream the LangGraph analyst's debrief: token/annotations/spotlight/done events."""
    await websocket.accept()
    try:
        async for event in astream_review(db, user_id, from_, to, symbol=symbol, query=query):
            await websocket.send_json(event)

        pref = db.get(UserPreference, user_id)
        if pref is None:
            pref = UserPreference(user_id=user_id)
            db.add(pref)
        pref.last_debrief_at = datetime.now(timezone.utc)
        db.commit()
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
