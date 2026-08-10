from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.dependencies.rate_limit import rate_limit
from app.schemas import TradeOut
from app.services.trade_retrieval import backfill_embeddings, semantic_search

router = APIRouter(
    prefix="/api/analysis",
    tags=["analysis"],
    dependencies=[Depends(get_current_user_id)],
)

_backfill_rate_limit = rate_limit("analysis-backfill", limit=5, window_ms=60_000, fail_open=False)


@router.post("/backfill-embeddings", dependencies=[Depends(_backfill_rate_limit)])
async def trigger_backfill(
    db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> dict:
    """Embed any of the caller's trades that don't have an embedding yet."""
    try:
        embedded = await backfill_embeddings(db, user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"embedded": embedded}


@router.get("/search", response_model=list[TradeOut])
async def search_trades(
    query: str = Query(..., min_length=1),
    limit: int = Query(5, le=20),
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> list:
    """Semantic search over the caller's trades, e.g. 'the one where I panicked
    and exited early'. Only searches trades that have been embedded — call
    /backfill-embeddings first if results look incomplete."""
    try:
        return await semantic_search(db, user_id, query, limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
