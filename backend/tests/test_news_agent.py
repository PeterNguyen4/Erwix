from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import MarketInsightCache
from app.services.news import NewsArticle
from app.services.news_agent import (
    MarketInsight,
    _articles_hash,
    _headlines_block,
    _normalize_sentiment,
    build_market_insight,
    get_market_insight,
)
from tests.conftest import make_user


def _article(url: str = "https://example.com/a") -> NewsArticle:
    return NewsArticle(
        symbol="SPY", title="Markets rally", publisher="Reuters", url=url,
        published_at=datetime.now(timezone.utc),
    )


def test_normalize_sentiment_lowercases_known_values():
    assert _normalize_sentiment("Bullish") == "bullish"


def test_normalize_sentiment_defaults_to_neutral_for_unknown():
    assert _normalize_sentiment("very excited") == "neutral"


def test_headlines_block_empty_when_no_articles():
    assert _headlines_block([]) == "No recent headlines found."


def test_headlines_block_includes_publisher_title_and_url():
    block = _headlines_block([_article()])
    assert "Reuters" in block
    assert "Markets rally" in block
    assert "https://example.com/a" in block


def test_articles_hash_is_order_independent():
    a = _article("https://example.com/a")
    b = _article("https://example.com/b")
    assert _articles_hash([a, b]) == _articles_hash([b, a])


def test_articles_hash_changes_with_different_urls():
    assert _articles_hash([_article("https://x/1")]) != _articles_hash([_article("https://x/2")])


def _fake_insight_model(sentiment="bullish", urls=None):
    model = MagicMock()
    model.with_structured_output.return_value = model
    model.ainvoke = AsyncMock(
        return_value=MarketInsight(
            sentiment=sentiment, advice="buy the dip", rationale=["strong jobs report"],
            highlighted_urls=urls or [],
        )
    )
    return model


@pytest.mark.asyncio
async def test_build_market_insight_filters_hallucinated_urls():
    articles = [_article("https://real.com/1")]
    fake_model = _fake_insight_model(urls=["https://real.com/1", "https://made-up.com/fake"])

    with (
        patch("app.services.news_agent._base_model", return_value=fake_model),
        patch("app.services.news_agent._validate_insight", new=AsyncMock(return_value=None)),
        patch("app.services.news_agent._strategy_block", new=AsyncMock(return_value="no strategy")),
    ):
        insight = await build_market_insight(db=MagicMock(), user_id=1, articles=articles)

    assert insight.highlighted_urls == ["https://real.com/1"]


@pytest.mark.asyncio
async def test_build_market_insight_retries_once_on_invalid_critique():
    articles = [_article()]
    fake_model = _fake_insight_model()

    with (
        patch("app.services.news_agent._base_model", return_value=fake_model),
        patch(
            "app.services.news_agent._validate_insight",
            new=AsyncMock(side_effect=["sentiment contradicts advice", None]),
        ) as mock_validate,
        patch("app.services.news_agent._strategy_block", new=AsyncMock(return_value="no strategy")),
    ):
        await build_market_insight(db=MagicMock(), user_id=1, articles=articles)

    assert mock_validate.await_count == 2
    assert fake_model.ainvoke.await_count == 2


@pytest.mark.asyncio
async def test_get_market_insight_uses_same_day_cache(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        MarketInsightCache(
            user_id=1, articles_hash="old-hash", sentiment="bearish", advice="cached advice",
            rationale=["cached"], highlighted_urls=[],
        )
    )
    await db_session.commit()

    with patch("app.services.news_agent.build_market_insight", new=AsyncMock()) as mock_build:
        insight = await get_market_insight(db_session, 1, [_article()])

    assert insight.advice == "cached advice"
    mock_build.assert_not_awaited()


@pytest.mark.asyncio
async def test_get_market_insight_force_refresh_bypasses_cache(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        MarketInsightCache(
            user_id=1, articles_hash="old-hash", sentiment="bearish", advice="cached advice",
            rationale=["cached"], highlighted_urls=[],
        )
    )
    await db_session.commit()

    fresh = MarketInsight(sentiment="bullish", advice="fresh advice", rationale=[], highlighted_urls=[])
    with patch("app.services.news_agent.build_market_insight", new=AsyncMock(return_value=fresh)) as mock_build:
        insight = await get_market_insight(db_session, 1, [_article()], force=True)

    assert insight.advice == "fresh advice"
    mock_build.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_market_insight_creates_cache_row_when_none_exists(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    fresh = MarketInsight(sentiment="neutral", advice="new advice", rationale=[], highlighted_urls=[])
    with patch("app.services.news_agent.build_market_insight", new=AsyncMock(return_value=fresh)):
        await get_market_insight(db_session, 1, [_article()])

    from sqlalchemy import select

    cached = (
        await db_session.execute(select(MarketInsightCache).where(MarketInsightCache.user_id == 1))
    ).scalar_one()
    assert cached.advice == "new advice"
