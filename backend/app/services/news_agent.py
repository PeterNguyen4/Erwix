"""News agent: turns market-wide scraped headlines (app.services.news) into
advice conditioned on the trader's own stated strategy archetype/playbook —
e.g. a strong jobs report reads as fuel for a Trend Rider but a reason for
caution for a Risk Guardian.

Reuses agent_graph._base_model() rather than re-deriving provider selection
(Anthropic/Ollama) here — that branching is meant to stay in one place.
"""

import hashlib
from datetime import datetime, timezone

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MarketInsightCache
from app.services.agent_graph import _base_model
from app.services.news import NewsArticle
from app.services.strategy_agent import get_strategy_context

MARKET_SYSTEM_PROMPT = (
    "You are a markets news analyst for a trading journal app. You are given a pool of recent "
    "headlines scraped across the broad market (major indices, not one ticker), and (if the "
    "trader has one) their stated trading strategy. First, pick out the handful of headlines "
    "that are most likely to actually move markets or matter to this specific trader's strategy "
    "— ignore filler/routine stories. Then judge the overall market read through the lens of "
    "that strategy, e.g. a strong jobs report reads as fuel for a trend-riding trader but a "
    "reason for caution for a capital-preservation-focused trader. If the trader has no stated "
    "strategy, give balanced, generic guidance instead.\n\n"
    "Write like you're texting a fellow trader a quick heads-up, not writing a research note: "
    "short, plain sentences, one idea each. No stacked clauses joined by em dashes or semicolons "
    "— break them into separate sentences instead. Skip financial-media buzzwords (backdrop, "
    "tailwind/headwind, catalyst, macro, exhaustion point) in favor of the plain-English version. "
    "Name the specific setup only when it's the point of the sentence, not in every clause. This "
    "is a scannable card, not a report — say the one or two things that actually matter and stop. "
    "`highlighted_urls` must be exact URLs copied from the headlines given, not paraphrased or "
    "invented."
)


class MarketInsight(BaseModel):
    sentiment: str = Field(description="One of: bullish, bearish, neutral")
    advice: str = Field(
        description="1-2 short, plain-language sentences of concrete advice for this trader, given the "
        "market read — no jargon, no stacked clauses, say the one thing that matters most"
    )
    rationale: list[str] = Field(
        description="1-2 short bullets on what drove this read, each one plain sentence, no jargon"
    )
    highlighted_urls: list[str] = Field(
        description="URLs (copied exactly from the given headlines) of the 3-6 most compelling/market-moving stories"
    )


def _headlines_block(articles: list[NewsArticle]) -> str:
    if not articles:
        return "No recent headlines found."
    return "\n".join(f"- [{a.publisher}] {a.title} ({a.url})" for a in articles)


async def _strategy_block(db: AsyncSession, user_id: int) -> str:
    ctx = await get_strategy_context(db, user_id)
    if ctx:
        label, rendered = ctx
        return f"The trader's stated strategy ({label}):\n{rendered}"
    return "The trader has not stated a strategy — give balanced, generic guidance."


def _normalize_sentiment(raw: str) -> str:
    sentiment = raw.lower().strip()
    return sentiment if sentiment in ("bullish", "bearish", "neutral") else "neutral"


class _InsightCritique(BaseModel):
    valid: bool = Field(description="True if the insight is internally consistent and well-supported")
    correction: str = Field(
        description="If not valid, one short sentence on what's wrong (e.g. sentiment contradicts advice, "
        "rationale doesn't tie to the headlines, advice is generic boilerplate). Empty string if valid."
    )


VALIDATE_SYSTEM_PROMPT = (
    "You are reviewing another analyst's market insight for internal consistency before it's shown "
    "to a trader. Check: does the sentiment (bullish/bearish/neutral) actually match the advice given? "
    "Does the rationale plausibly derive from the headlines provided, rather than being invented? Is "
    "the advice concrete and specific rather than generic filler that could apply to any market? Judge "
    "harshly but fairly — minor stylistic issues are not grounds for rejection."
)


async def _validate_insight(insight: MarketInsight, articles: list[NewsArticle], strategy_block: str) -> str | None:
    """LLM judge evaluating insight. Returns None if it holds up,
    else a short correction note to feed back into a regeneration attempt."""
    prompt = (
        f"Headlines considered:\n{_headlines_block(articles)}\n\n{strategy_block}\n\n"
        f"Sentiment: {insight.sentiment}\nAdvice: {insight.advice}\n"
        f"Rationale: {'; '.join(insight.rationale) if insight.rationale else '(none given)'}"
    )
    model = _base_model(num_predict=150).with_structured_output(_InsightCritique)
    critique = await model.ainvoke([SystemMessage(VALIDATE_SYSTEM_PROMPT), HumanMessage(prompt)])
    return critique.correction.strip() if not critique.valid and critique.correction.strip() else None


async def build_market_insight(db: AsyncSession, user_id: int, articles: list[NewsArticle]) -> MarketInsight:
    strategy_block = await _strategy_block(db, user_id)
    headlines_block = _headlines_block(articles)
    known_urls = {a.url for a in articles}
    model = _base_model().with_structured_output(MarketInsight)

    messages: list = [
        SystemMessage(MARKET_SYSTEM_PROMPT),
        HumanMessage(f"Recent market-wide headlines:\n{headlines_block}\n\n{strategy_block}"),
    ]

    for attempt in range(2):
        result = await model.ainvoke(messages)
        insight = MarketInsight(
            sentiment=_normalize_sentiment(result.sentiment),
            advice=result.advice,
            rationale=result.rationale,
            highlighted_urls=[u for u in result.highlighted_urls if u in known_urls],
        )
        correction = await _validate_insight(insight, articles, strategy_block)
        if correction is None or attempt == 1:
            return insight
        messages = [
            *messages,
            AIMessage(result.model_dump_json()),
            HumanMessage(f"That read doesn't hold up: {correction}. Try again, fixing only that issue."),
        ]
    raise AssertionError("unreachable")


def _articles_hash(articles: list[NewsArticle]) -> str:
    return hashlib.sha256("\n".join(sorted(a.url for a in articles)).encode()).hexdigest()


async def get_market_insight(
    db: AsyncSession, user_id: int, articles: list[NewsArticle], force: bool = False
) -> MarketInsight:
    """Cached wrapper around build_market_insight — reused across page visits for
    the rest of the calendar day, so navigating to the News page doesn't re-run
    the LLM every time. Gated on calendar day rather than an exact hash of the
    scraped headline pool: Yahoo's search results reorder/rotate slightly on
    every fetch, so a hash-of-headlines gate almost never matched and silently
    regenerated on every visit. `force` (Refresh button) always regenerates."""
    articles_hash = _articles_hash(articles)
    today = datetime.now(timezone.utc).date()

    cached = (
        await db.execute(select(MarketInsightCache).where(MarketInsightCache.user_id == user_id))
    ).scalar_one_or_none()

    if cached and not force and cached.generated_at.date() == today:
        return MarketInsight(
            sentiment=cached.sentiment,
            advice=cached.advice,
            rationale=cached.rationale,
            highlighted_urls=cached.highlighted_urls,
        )

    insight = await build_market_insight(db, user_id, articles)

    if cached:
        cached.articles_hash = articles_hash
        cached.sentiment = insight.sentiment
        cached.advice = insight.advice
        cached.rationale = insight.rationale
        cached.highlighted_urls = insight.highlighted_urls
    else:
        db.add(
            MarketInsightCache(
                user_id=user_id,
                articles_hash=articles_hash,
                sentiment=insight.sentiment,
                advice=insight.advice,
                rationale=insight.rationale,
                highlighted_urls=insight.highlighted_urls,
            )
        )
    await db.commit()

    return insight
