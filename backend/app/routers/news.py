import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user_id
from app.db import get_db
from app.dependencies.rate_limit import rate_limit
from app.models import User
from app.schemas import MarketInsightOut, NewsArticleOut
from app.services.news import fetch_market_news
from app.services.news_agent import get_market_insight

logger = logging.getLogger("erwix.news")

router = APIRouter(prefix="/api/news", tags=["news"], dependencies=[Depends(get_current_user_id)])

_insight_rate_limit = rate_limit("news-insight", limit=15, window_ms=60_000, fail_open=False)


@router.get("/market-articles", response_model=list[NewsArticleOut])
async def market_articles() -> list[NewsArticleOut]:
    """Market-wide headlines (major index proxies, not a single ticker), no
    LLM call — lets the UI show the news immediately instead of waiting on
    the agent to pick out the compelling stories first."""
    try:
        articles = await fetch_market_news()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc
    return [
        NewsArticleOut(
            symbol=a.symbol,
            title=a.title,
            publisher=a.publisher,
            url=a.url,
            published_at=a.published_at,
            thumbnail_url=a.thumbnail_url,
            related_tickers=a.related_tickers,
        )
        for a in articles
    ]


@router.get(
    "/market-insight",
    response_model=MarketInsightOut,
    dependencies=[Depends(_insight_rate_limit)],
)
async def market_insight(
    refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> MarketInsightOut:
    if refresh:
        user = await db.get(User, user_id)
        if user is None or user.role != "admin":
            raise HTTPException(
                status_code=403, detail="Admin access required to regenerate insights"
            )

    try:
        articles = await fetch_market_news()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc

    try:
        insight = await get_market_insight(db, user_id, articles, force=refresh)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return MarketInsightOut(
        sentiment=insight.sentiment,
        advice=insight.advice,
        rationale=insight.rationale,
        highlighted_urls=insight.highlighted_urls,
    )
