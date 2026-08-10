from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.models import (
    AlpacaAccount,
    MarketInsightCache,
    NotificationDismissal,
    StrategyNote,
    UserPreference,
)
from app.schemas import NotificationKeyIn, NotificationOut, NotificationsOut
from app.services.trade_retrieval import count_trades_since, latest_fill_since

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

DEBRIEF_LOOKBACK = timedelta(days=30)
# Alpaca/strategy nudges are persistent conditions, not one-off events — a dismissal
# snoozes them rather than permanently hiding an unresolved gap.
PERSISTENT_TYPES = {"alpaca_disconnected", "strategy_missing"}
DISMISS_EXPIRY = timedelta(days=2)


async def _dismissal_map(db: AsyncSession, user_id: int) -> dict[str, NotificationDismissal]:
    rows = (
        await db.scalars(
            select(NotificationDismissal).where(NotificationDismissal.user_id == user_id)
        )
    ).all()
    return {r.notification_key: r for r in rows}


def _state(
    dismissals: dict[str, NotificationDismissal], key: str, type_: str
) -> NotificationDismissal | None:
    """The dismissal row governing this instance, or None if it doesn't apply
    (never touched, or an expired persistent-type snooze — treated as fresh)."""
    row = dismissals.get(key)
    if row is None:
        return None
    if row.dismissed_at is not None and type_ in PERSISTENT_TYPES:
        if datetime.now(UTC) - row.dismissed_at > DISMISS_EXPIRY:
            return None
    return row


async def _build_items(db: AsyncSession, user_id: int) -> list[NotificationOut]:
    dismissals = await _dismissal_map(db, user_id)
    items: list[NotificationOut] = []

    pref = await db.scalar(select(UserPreference).where(UserPreference.user_id == user_id))
    last_debrief_at = pref.last_debrief_at if pref else None
    since = last_debrief_at or (datetime.now(UTC) - DEBRIEF_LOOKBACK)
    new_trade_count = await count_trades_since(db, user_id, since)
    if new_trade_count > 0:
        fired_at = await latest_fill_since(db, user_id, since) or datetime.now(UTC)
        key = f"debrief_ready:{fired_at.isoformat()}"
        state = _state(dismissals, key, "debrief_ready")
        if state is None or state.dismissed_at is None:
            items.append(
                NotificationOut(
                    id=key,
                    type="debrief_ready",
                    title="Debrief ready",
                    body=(
                        f"{new_trade_count} new trade{'s' if new_trade_count != 1 else ''} "
                        "since your last debrief."
                    ),
                    href="/portfolio",
                    created_at=fired_at,
                    unseen=state is None or state.read_at is None,
                )
            )

    insight = await db.scalar(
        select(MarketInsightCache).where(MarketInsightCache.user_id == user_id)
    )
    if insight is not None:
        key = f"news_insight:{insight.articles_hash}"
        state = _state(dismissals, key, "news_insight")
        if state is None or state.dismissed_at is None:
            items.append(
                NotificationOut(
                    id=key,
                    type="news_insight",
                    title="Market insight updated",
                    body=f"New {insight.sentiment} sentiment read on today's headlines.",
                    href="/news",
                    created_at=insight.generated_at,
                    unseen=state is None or state.read_at is None,
                )
            )

    alpaca_account = await db.scalar(select(AlpacaAccount).where(AlpacaAccount.user_id == user_id))
    if alpaca_account is None:
        key = "alpaca_disconnected"
        state = _state(dismissals, key, key)
        if state is None or state.dismissed_at is None:
            items.append(
                NotificationOut(
                    id=key,
                    type="alpaca_disconnected",
                    title="Connect your Alpaca account",
                    body="Link Alpaca to start trading and auto-log your fills.",
                    href="/settings",
                    created_at=datetime(2000, 1, 1, tzinfo=UTC),
                    unseen=state is None or state.read_at is None,
                )
            )

    has_strategy = await db.scalar(
        select(StrategyNote).where(StrategyNote.user_id == user_id).limit(1)
    )
    if has_strategy is None:
        key = "strategy_missing"
        state = _state(dismissals, key, key)
        if state is None or state.dismissed_at is None:
            items.append(
                NotificationOut(
                    id=key,
                    type="strategy_missing",
                    title="Set up your strategy",
                    body="Define a trading strategy to unlock rule watching and exit guidance.",
                    href="/strategy",
                    created_at=datetime(2000, 1, 1, tzinfo=UTC),
                    unseen=state is None or state.read_at is None,
                )
            )

    return items


def _out(items: list[NotificationOut]) -> NotificationsOut:
    items = sorted(items, key=lambda n: n.created_at, reverse=True)
    return NotificationsOut(items=items, unseen_count=sum(1 for n in items if n.unseen))


async def _get_or_create(db: AsyncSession, user_id: int, key: str) -> NotificationDismissal:
    row = await db.scalar(
        select(NotificationDismissal).where(
            NotificationDismissal.user_id == user_id,
            NotificationDismissal.notification_key == key,
        )
    )
    if row is None:
        row = NotificationDismissal(user_id=user_id, notification_key=key)
        db.add(row)
    return row


@router.get("", response_model=NotificationsOut)
async def list_notifications(
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> NotificationsOut:
    return _out(await _build_items(db, user_id))


@router.post("/read", response_model=NotificationsOut)
async def mark_notification_read(
    body: NotificationKeyIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> NotificationsOut:
    """Clears the unread marker on one notification instance — called when
    the user clicks it to navigate to the linked page."""
    row = await _get_or_create(db, user_id, body.key)
    row.read_at = datetime.now(UTC)
    await db.commit()
    return _out(await _build_items(db, user_id))


@router.post("/dismiss", response_model=NotificationsOut)
async def dismiss_notification(
    body: NotificationKeyIn,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> NotificationsOut:
    """Removes one notification instance from the list. Permanent for
    one-off events (debrief/news, which get a fresh key on the next
    instance anyway); snoozed for DISMISS_EXPIRY on persistent-condition
    nudges (Alpaca/strategy), which resurface unread if still unresolved."""
    now = datetime.now(UTC)
    row = await _get_or_create(db, user_id, body.key)
    row.dismissed_at = now
    row.read_at = row.read_at or now
    await db.commit()
    return _out(await _build_items(db, user_id))
