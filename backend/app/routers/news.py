import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.db import get_db
from app.schemas import MarketInsightOut, NewsArticleOut
from app.services.news import fetch_market_news
from app.services.news_agent import build_market_insight

logger = logging.getLogger("entro.news")

router = APIRouter(prefix="/api/news", tags=["news"], dependencies=[Depends(get_current_user_id)])


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
        NewsArticleOut(symbol=a.symbol, title=a.title, publisher=a.publisher, url=a.url, published_at=a.published_at)
        for a in articles
    ]


@router.get("/market-insight", response_model=MarketInsightOut)
async def market_insight(
    db: Session = Depends(get_db),
    user_id: int = Depends(get_current_user_id),
) -> MarketInsightOut:
    """The agent's read on the current market-wide headline pool: picks out
    the most compelling stories and judges them against the trader's stated
    strategy archetype (Strategy tab)."""
    try:
        articles = await fetch_market_news()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc

    try:
        insight = await build_market_insight(db, user_id, articles)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return MarketInsightOut(
        sentiment=insight.sentiment,
        advice=insight.advice,
        rationale=insight.rationale,
        highlighted_urls=insight.highlighted_urls,
    )
