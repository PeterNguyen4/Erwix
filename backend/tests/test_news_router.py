from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services.news import NewsArticle
from app.services.news_agent import MarketInsight
from tests.conftest import TEST_USER_ID


def _article() -> NewsArticle:
    return NewsArticle(
        symbol="SPY", title="Markets rally", publisher="Reuters",
        url="https://example.com/a", published_at=datetime.now(timezone.utc),
    )


def test_market_articles_returns_scraped_headlines(client):
    with patch("app.routers.news.fetch_market_news", new=AsyncMock(return_value=[_article()])):
        resp = client.get("/api/news/market-articles")
    assert resp.status_code == 200
    assert resp.json()[0]["title"] == "Markets rally"


def test_market_articles_maps_http_error_to_502(client):
    with patch(
        "app.routers.news.fetch_market_news",
        new=AsyncMock(side_effect=httpx.HTTPError("boom")),
    ):
        resp = client.get("/api/news/market-articles")
    assert resp.status_code == 502


def test_market_insight_returns_llm_read(client):
    insight = MarketInsight(sentiment="bullish", advice="buy the dip", rationale=["strong jobs"], highlighted_urls=[])
    with (
        patch("app.routers.news.fetch_market_news", new=AsyncMock(return_value=[_article()])),
        patch("app.routers.news.get_market_insight", new=AsyncMock(return_value=insight)),
    ):
        resp = client.get("/api/news/market-insight")
    assert resp.status_code == 200
    assert resp.json()["sentiment"] == "bullish"


def test_market_insight_refresh_requires_admin(client):
    resp = client.get("/api/news/market-insight?refresh=true")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_market_insight_refresh_allowed_for_admin(client, db_session):
    from app.models import User

    admin = await db_session.get(User, TEST_USER_ID)
    admin.role = "admin"
    await db_session.commit()

    insight = MarketInsight(sentiment="neutral", advice="wait it out", rationale=[], highlighted_urls=[])
    with (
        patch("app.routers.news.fetch_market_news", new=AsyncMock(return_value=[_article()])),
        patch("app.routers.news.get_market_insight", new=AsyncMock(return_value=insight)) as mock_insight,
    ):
        resp = client.get("/api/news/market-insight?refresh=true")
    assert resp.status_code == 200
    assert mock_insight.call_args.kwargs.get("force") is True or mock_insight.call_args.args[-1] is True


def test_market_insight_maps_llm_runtime_error_to_503(client):
    with (
        patch("app.routers.news.fetch_market_news", new=AsyncMock(return_value=[_article()])),
        patch("app.routers.news.get_market_insight", new=AsyncMock(side_effect=RuntimeError("no creds"))),
    ):
        resp = client.get("/api/news/market-insight")
    assert resp.status_code == 503
