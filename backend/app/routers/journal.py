from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from app.auth import get_current_user_id
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import JournalEntry, Trade
from app.schemas import (
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
    PnLSummaryOut,
    PnLTrendOut,
    PnLWeeklyComparisonOut,
    TradeNoteUpdate,
    TradeOut,
)
from app.services.trade_retrieval import (
    compute_pnl_daily_trend,
    compute_pnl_summary,
    compute_pnl_weekly_comparison,
    embed_trade_best_effort,
)

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


@router.get("/pnl-summary/weekly", response_model=PnLWeeklyComparisonOut)
async def pnl_summary_weekly(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> PnLWeeklyComparisonOut:
    """This-week vs previous-week PnL stats, for the portfolio chips' delta row."""
    current, previous = await compute_pnl_weekly_comparison(db, user_id)
    return PnLWeeklyComparisonOut(
        current=PnLSummaryOut.model_validate(current),
        previous=PnLSummaryOut.model_validate(previous),
    )


@router.get("/pnl-summary/trend", response_model=PnLTrendOut)
async def pnl_summary_trend(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    days: int = Query(14, ge=2, le=90),
) -> PnLTrendOut:
    """Cumulative daily snapshots for the portfolio chip sparklines."""
    trend = await compute_pnl_daily_trend(db, user_id, days)
    return PnLTrendOut.model_validate(trend)


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


@router.get("/entries", response_model=list[JournalEntryOut])
async def list_journal_entries(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
    symbol: str | None = None,
    from_: date | None = Query(None, alias="from"),
    to: date | None = None,
) -> list[JournalEntry]:
    stmt = select(JournalEntry).where(JournalEntry.user_id == user_id).order_by(JournalEntry.entry_date.desc())
    if symbol:
        stmt = stmt.where(JournalEntry.symbol == symbol.upper())
    if from_:
        stmt = stmt.where(JournalEntry.entry_date >= from_)
    if to:
        stmt = stmt.where(JournalEntry.entry_date <= to)
    return list((await db.scalars(stmt)).all())


@router.post("/entries", response_model=JournalEntryOut)
async def create_journal_entry(
    body: JournalEntryCreate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> JournalEntry:
    entry = JournalEntry(user_id=user_id, **body.model_dump())
    if entry.symbol:
        entry.symbol = entry.symbol.upper()
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.patch("/entries/{entry_id}", response_model=JournalEntryOut)
async def update_journal_entry(
    entry_id: int,
    body: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> JournalEntry:
    entry = await db.get(JournalEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(entry, field, value.upper() if field == "symbol" and value else value)
    await db.commit()
    await db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_journal_entry(
    entry_id: int,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> None:
    entry = await db.get(JournalEntry, entry_id)
    if entry is None or entry.user_id != user_id:
        raise HTTPException(status_code=404, detail="Journal entry not found")
    await db.delete(entry)
    await db.commit()
