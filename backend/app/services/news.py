"""News scraper for the news agent.

Reuses Yahoo Finance's public, keyless search endpoint (already used for
symbol search in alpaca_client.search_assets) with newsCount>0 instead of
requiring a paid news-API signup — it aggregates headlines from several
publishers (Reuters, Barron's, MarketWatch, etc.) per ticker for free.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.services.yahoo_finance import yahoo_search

logger = logging.getLogger("erwix.news")

# Broad index proxies used to pull market-wide (not single-ticker) headlines —
# S&P 500, Dow, Nasdaq, and the VIX (volatility/risk-sentiment stories).
MARKET_PROXY_SYMBOLS = ["^GSPC", "^DJI", "^IXIC", "^VIX"]


@dataclass
class NewsArticle:
    symbol: str
    title: str
    publisher: str
    url: str
    published_at: datetime
    thumbnail_url: str | None = None
    related_tickers: list[str] = field(default_factory=list)


def _get_thumbnail(item: dict) -> str | None:
    resolutions = item.get("thumbnail", {}).get("resolutions", [])
    if not resolutions:
        return None
    return min(resolutions, key=lambda r: r.get("width", 0)).get("url")


async def _fetch_symbol_news(symbol: str, limit: int) -> list[NewsArticle]:
    data = await yahoo_search(
        {"q": symbol, "quotesCount": 0, "newsCount": limit, "enableFuzzyQuery": "false"}
    )

    articles = []
    for item in data.get("news", [])[:limit]:
        title = item.get("title")
        url = item.get("link")
        publish_time = item.get("providerPublishTime")
        if not title or not url or publish_time is None:
            continue
        articles.append(
            NewsArticle(
                symbol=symbol,
                title=title,
                publisher=item.get("publisher", "Unknown"),
                url=url,
                published_at=datetime.fromtimestamp(publish_time, tz=UTC),
                thumbnail_url=_get_thumbnail(item),
                related_tickers=[
                    t
                    for t in item.get("relatedTickers", [])
                    if not t.startswith("^") and "=" not in t
                ],
            )
        )
    return articles


async def fetch_news(symbols: list[str], limit_per_symbol: int = 6) -> list[NewsArticle]:
    """Fetch recent headlines for each symbol concurrently, newest first.
    Best-effort per symbol — one symbol's fetch failing doesn't fail the rest."""
    results = await asyncio.gather(
        *(_fetch_symbol_news(s.upper(), limit_per_symbol) for s in symbols),
        return_exceptions=True,
    )
    articles: list[NewsArticle] = []
    for symbol, result in zip(symbols, results, strict=True):
        if isinstance(result, Exception):
            logger.warning("news fetch failed for %s", symbol, exc_info=result)
            continue
        articles.extend(result)
    articles.sort(key=lambda a: a.published_at, reverse=True)
    return articles


async def fetch_market_news(limit: int = 20) -> list[NewsArticle]:
    """Market-wide headlines, not tied to any one ticker — pulls from the major
    index proxies and dedupes by URL (the same story often surfaces under more
    than one index's search results)."""
    articles = await fetch_news(MARKET_PROXY_SYMBOLS, limit_per_symbol=limit)
    seen: set[str] = set()
    deduped: list[NewsArticle] = []
    for a in articles:
        if a.url in seen:
            continue
        seen.add(a.url)
        deduped.append(a)
    return deduped[:limit]
