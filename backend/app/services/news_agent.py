"""News agent: turns scraped headlines (app.services.news) into per-symbol
advice conditioned on the trader's own stated strategy archetype/playbook —
e.g. a good-earnings headline reads as a growth opportunity for a Trend
Rider but a risk to note (not chase) for a Risk Guardian.

Reuses agent_graph._base_model() rather than re-deriving provider selection
(Anthropic/Ollama) here — that branching is meant to stay in one place.
"""

import json

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.services.agent_graph import _base_model
from app.services.news import NewsArticle
from app.services.strategy import archetype_name, get_active_strategy, render_playbook

NEWS_SYSTEM_PROMPT = (
    "You are a markets news analyst for a trading journal app. You are given a symbol, a "
    "handful of recent headlines about it, and (if the trader has one) their stated trading "
    "strategy. Judge the news through the lens of that specific strategy — e.g. a strong "
    "earnings beat reads as a growth opportunity for a trend-riding trader, but as a reason "
    "for caution (not chasing strength) for a capital-preservation-focused trader. If the "
    "trader has no stated strategy, give balanced, generic guidance instead. Be concrete and "
    "brief — this is a scannable card, not a report."
)


class NewsInsight(BaseModel):
    sentiment: str = Field(description="One of: bullish, bearish, neutral")
    advice: str = Field(description="2-3 sentences of concrete advice for this trader, given the headlines")
    rationale: list[str] = Field(description="1-3 short bullets on what in the headlines drove this read")


def _headlines_block(articles: list[NewsArticle]) -> str:
    if not articles:
        return "No recent headlines found."
    return "\n".join(f"- [{a.publisher}] {a.title}" for a in articles)


async def build_news_insight(db: Session, user_id: str, symbol: str, articles: list[NewsArticle]) -> NewsInsight:
    strategy = get_active_strategy(db, user_id)
    if strategy and strategy.structured_summary:
        try:
            rendered = render_playbook(json.loads(strategy.structured_summary))
        except (json.JSONDecodeError, TypeError, AttributeError):
            rendered = strategy.structured_summary
        label = archetype_name(strategy.archetype) or "Custom"
        strategy_block = f"The trader's stated strategy ({label}):\n{rendered}"
    else:
        strategy_block = "The trader has not stated a strategy — give balanced, generic guidance."

    prompt = f"Symbol: {symbol}\n\nRecent headlines:\n{_headlines_block(articles)}\n\n{strategy_block}"
    model = _base_model().with_structured_output(NewsInsight)
    result = await model.ainvoke([SystemMessage(NEWS_SYSTEM_PROMPT), HumanMessage(prompt)])
    sentiment = result.sentiment.lower().strip()
    if sentiment not in ("bullish", "bearish", "neutral"):
        sentiment = "neutral"
    return NewsInsight(sentiment=sentiment, advice=result.advice, rationale=result.rationale)
