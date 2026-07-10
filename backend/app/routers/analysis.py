from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import require_auth
from app.db import get_db
from app.schemas import TradeOut
from app.services.trade_retrieval import backfill_embeddings, semantic_search

router = APIRouter(prefix="/api/analysis", tags=["analysis"], dependencies=[Depends(require_auth)])


@router.post("/backfill-embeddings")
def trigger_backfill(db: Session = Depends(get_db), user_id: str = Depends(require_auth)) -> dict:
    """Embed any of the caller's trades that don't have an embedding yet."""
    try:
        embedded = backfill_embeddings(db, user_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return {"embedded": embedded}


@router.get("/search", response_model=list[TradeOut])
def search_trades(
    query: str = Query(..., min_length=1),
    limit: int = Query(5, le=20),
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> list:
    """Semantic search over the caller's trades, e.g. 'the one where I panicked
    and exited early'. Only searches trades that have been embedded — call
    /backfill-embeddings first if results look incomplete."""
    try:
        return semantic_search(db, user_id, query, limit)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
