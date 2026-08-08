from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.models import WatchlistItem
from app.schemas import WatchlistItemOut

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"], dependencies=[Depends(get_current_user_id)])


@router.get("", response_model=list[WatchlistItemOut])
async def list_watchlist(
    db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> list[WatchlistItem]:
    stmt = select(WatchlistItem).where(WatchlistItem.user_id == user_id).order_by(WatchlistItem.created_at)
    return list((await db.scalars(stmt)).all())


@router.post("/{symbol}", response_model=WatchlistItemOut)
async def add_watchlist_item(
    symbol: str, db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> WatchlistItem:
    item = WatchlistItem(user_id=user_id, symbol=symbol.upper())
    db.add(item)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Symbol already on watchlist")
    await db.refresh(item)
    return item


@router.delete("/{symbol}", status_code=204)
async def remove_watchlist_item(
    symbol: str, db: AsyncSession = Depends(get_db), user_id: int = Depends(get_current_user_id)
) -> None:
    stmt = select(WatchlistItem).where(WatchlistItem.user_id == user_id, WatchlistItem.symbol == symbol.upper())
    item = (await db.scalars(stmt)).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Symbol not on watchlist")
    await db.delete(item)
    await db.commit()
