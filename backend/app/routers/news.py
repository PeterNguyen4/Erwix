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


@router.get("/insights", response_model=list[NewsInsightOut])
async def news_insights(
    symbols: str = Query(..., description="Comma-separated symbols, e.g. AAPL,MSFT"),
    db: Session = Depends(get_db),
    user_id: str = Depends(require_auth),
) -> list[NewsInsightOut]:
    """Scrape recent headlines per symbol and have the news agent judge them
    against the trader's stated strategy archetype (Strategy tab), one
    insight per symbol."""
    symbol_list = [s.strip().upper() for s in symbols.split(",") if s.strip()]
    if not symbol_list:
        raise HTTPException(status_code=400, detail="At least one symbol is required")

    try:
        articles = await fetch_news(symbol_list)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"News fetch failed: {exc}") from exc

    insights: list[NewsInsightOut] = []
    for symbol in symbol_list:
        symbol_articles = [a for a in articles if a.symbol == symbol]
        try:
            insight = await build_news_insight(db, user_id, symbol, symbol_articles)
        except RuntimeError as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc
        insights.append(
            NewsInsightOut(
                symbol=symbol,
                sentiment=insight.sentiment,
                advice=insight.advice,
                rationale=insight.rationale,
                articles=[
                    NewsArticleOut(
                        symbol=a.symbol,
                        title=a.title,
                        publisher=a.publisher,
                        url=a.url,
                        published_at=a.published_at,
                    )
                    for a in symbol_articles
                ],
            )
        )
    return insights
