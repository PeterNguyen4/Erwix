from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import Trade
from app.schemas import TradeOut

router = APIRouter(prefix="/api/journal", tags=["journal"])


@router.get("/trades", response_model=list[TradeOut])
def list_trades(
    db: Session = Depends(get_db),
    symbol: str | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    limit: int = Query(500, le=2000),
) -> list[Trade]:
    """Windowed query over auto-logged fills — the analyst's review window."""
    stmt = select(Trade).order_by(Trade.filled_at.desc())
    if symbol:
        stmt = stmt.where(Trade.symbol == symbol.upper())
    if from_:
        stmt = stmt.where(Trade.filled_at >= from_)
    if to:
        stmt = stmt.where(Trade.filled_at <= to)
    stmt = stmt.limit(limit)
    return list(db.scalars(stmt).all())


@router.get("/trades/{trade_id}", response_model=TradeOut)
def get_trade(trade_id: int, db: Session = Depends(get_db)) -> Trade:
    trade = db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=404, detail="Trade not found")
    return trade
