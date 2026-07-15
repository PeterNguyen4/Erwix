import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.auth import require_auth
from app.db import get_db
from app.schemas import NewsArticleOut, NewsInsightOut
from app.services.news import fetch_news
from app.services.news_agent import build_news_insight

logger = logging.getLogger("entro.news")

router = APIRouter(prefix="/api/news", tags=["news"], dependencies=[Depends(require_auth)])


@router.get("/articles", response_model=list[NewsArticleOut])
async def news_articles(
    symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,MSFT"),
) -> list[NewsArticleOut]:
    """Raw scraped headlines only, no LLM call — lets the UI show the news
    immediately instead of waiting on the agent to synthesize advice for
    every symbol before anything renders."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="At least one symbol is required")
    try:
        articles = await fetch_news(symbol_list)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc
    return [
        NewsArticleOut(symbol=a.symbol, title=a.title, publisher=a.publisher, url=a.url, published_at=a.published_at)
        for a in articles
    ]


@router.get("/insight", response_model=NewsInsightOut)
async def news_insight(
    symbol: str = Query(..., description="Single symbol, e.g. AAPL"),
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> NewsInsightOut:
    """The agent's take on one symbol's recent headlines, judged against the
    trader's stated strategy archetype (Strategy tab). Kept single-symbol
    (rather than batched like /articles) so the frontend can fetch each
    symbol's advice independently and fill in cards as each resolves, instead
    of the whole page waiting on the slowest LLM call in a batch."""
    symbol = symbol.strip().upper()
    try:
        articles = await fetch_news([symbol])
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc

    try:
        insight = await build_news_insight(db, user_id, symbol, articles)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return NewsInsightOut(
        symbol=symbol,
        sentiment=insight.sentiment,
        advice=insight.advice,
        rationale=insight.rationale,
        articles=[
            NewsArticleOut(symbol=a.symbol, title=a.title, publisher=a.publisher, url=a.url, published_at=a.published_at)
            for a in articles
        ],
    )
