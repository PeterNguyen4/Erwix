from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_user_id
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import Trade
from app.schemas import PnLSummaryOut, TradeNoteUpdate, TradeOut
from app.services.trade_retrieval import compute_pnl_summary, embed_trade_best_effort

router = APIRouter(prefix="/api/journal", tags=["journal"], dependencies=[Depends(get_current_user_id)])


@router.get("/trades", response_model=list[TradeOut])
async def list_trades(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    symbol: str | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(500, le=2000),
) -> list[Trade]:
    """Windowed query over auto-logged fills — the analyst's review window and
    the journal UI. Orders are now logged from submission (status="new")
    onward, but this endpoint still only surfaces trades that have filled,
    matching what the journal UI (and the analyst's RAG window) expect;
    pending intent/bracket-leg rows live in the same table for future use."""
    stmt = (
        select(Trade)
        .where(Trade.user_id == user_id, Trade.filled_at.isnot(None))
        .order_by(Trade.filled_at.desc())
    )
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol.upper())
    if from_:
        stmt = stmt.where(Trade.filled_at >= from_)
    if to:
        stmt = stmt.where(Trade.filled_at <= to)
    stmt = stmt.limit(limit)
    return list((await db.scalars(stmt)).all())


@router.get("/pnl-summary", response_model=PnLSummaryOut)
async def pnl_summary(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
) -> PnLSummaryOut:
    """Realized PnL + win/loss stats for round-trips closed in [from, to]."""
    summary = await compute_pnl_summary(db, user_id, from_, to)
    return PnLSummaryOut.model_validate(summary)


@router.get("/trades/{trade_id}", response_model=TradeOut)
async def get_trade(trade_id: int, db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None or trade.user_id != user_id:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade


@router.patch("/trades/{trade_id}/notes", response_model=TradeOut)
async def update_trade_notes(
    trade_id: int,
    body: TradeNoteUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> Trade:
    trade = await db.get(Trade, trade_id)
    if trade is None or trade.user_id != user_id:
        raise HTTPException(status_code=404, detail="Trade not found")
    trade.notes = body.notes
    await db.commit()
    await db.refresh(trade)
    await embed_trade_best_effort(db, trade)
    return trade
