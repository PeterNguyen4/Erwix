from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.models import AlpacaAccount, MarketInsightCache, StrategyNote, UserPreference
from app.schemas import NotificationOut, NotificationsOut
from app.services.trade_retrieval import count_trades_since, latest_fill_since

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

DEBRIEF_LOOKBACK = timedelta(days=30)


async def _build_items(db: AsyncSession, user_id: int, seen_at: datetime | None) -> list[NotificationOut]:
    items: list[NotificationOut] = []

    pref = await db.get(UserPreference, user_id)
    last_debrief_at = pref.last_debrief_at if pref else None
    since = last_debrief_at or (datetime.now(timezone.utc) - DEBRIEF_LOOKBACK)
    new_trade_count = await count_trades_since(db, user_id, since)
    if new_trade_count > 0:
        fired_at = await latest_fill_since(db, user_id, since) or datetime.now(timezone.utc)
        items.append(NotificationOut(
            id="debrief_ready",
            type="debrief_ready",
            title="Debrief ready",
            body=f"{new_trade_count} new trade{'s' if new_trade_count != 1 else ''} since your last debrief.",
            href="/portfolio",
            created_at=fired_at,
            unseen=seen_at is None or fired_at > seen_at,
        ))

    insight = await db.scalar(select(MarketInsightCache).where(MarketInsightCache.user_id == user_id))
    if insight is not None:
        items.append(NotificationOut(
            id="news_insight",
            type="news_insight",
            title="Market insight updated",
            body=f"New {insight.sentiment} sentiment read on today's headlines.",
            href="/news",
            created_at=insight.generated_at,
            unseen=seen_at is None or insight.generated_at > seen_at,
        ))

    alpaca_account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if alpaca_account is None:
        items.append(NotificationOut(
            id="alpaca_disconnected",
            type="alpaca_disconnected",
            title="Connect your Alpaca account",
            body="Link Alpaca to start trading and auto-log your fills.",
            href="/settings",
            created_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
            unseen=seen_at is None,
        ))

    strategy_count = await db.scalar(select(StrategyNote).where(StrategyNote.user_id == user_id).limit(1))
    if strategy_count is None:
        items.append(NotificationOut(
            id="strategy_missing",
            type="strategy_missing",
            title="Set up your strategy",
            body="Define a trading strategy to unlock rule watching and exit guidance.",
            href="/strategy",
            created_at=datetime(2000, 1, 1, tzinfo=timezone.utc),
            unseen=seen_at is None,
        ))

    return items


@router.get("", response_model=NotificationsOut)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> NotificationsOut:
    pref = await db.get(UserPreference, user_id)
    seen_at = pref.notifications_seen_at if pref else None
    items = await _build_items(db, user_id, seen_at)
    items.sort(key=lambda n: n.created_at, reverse=True)
    return NotificationsOut(items=items, unseen_count=sum(1 for n in items if n.unseen))


@router.post("/seen", response_model=NotificationsOut)
async def mark_notifications_seen(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> NotificationsOut:
    pref = await db.get(UserPreference, user_id)
    if pref is None:
        pref = UserPreference(user_id=user_id)
        db.add(pref)
    pref.notifications_seen_at = datetime.now(timezone.utc)
    await db.commit()
    items = await _build_items(db, user_id, pref.notifications_seen_at)
    items.sort(key=lambda n: n.created_at, reverse=True)
    return NotificationsOut(items=items, unseen_count=sum(1 for n in items if n.unseen))
