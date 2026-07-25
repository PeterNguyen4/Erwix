"""Strategist agent: distills the Strategy tab's archetype + free-form body
into a structured playbook (see StrategyPlaybook), stored as JSON in
StrategyNote.structured_summary and read by agent_graph._system_prompt.

Reuses agent_graph._base_model() rather than re-deriving provider selection
(Anthropic/Ollama) here — that branching is meant to stay in one place.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.schemas_strategy import StrategyRuleSet
from app.services.agent_graph import _base_model
from app.services.strategy import archetype_name

STRATEGIST_SYSTEM_PROMPT = (
    "You are a trading strategist. A trader has chosen an archetype and described their "
    "strategy in their own words. Distill it into a playbook by filling out the "
    "StrategyPlaybook fields, written in second person ('you') and in plain text with no "
    "markdown formatting (no asterisks, no headers) — each bullet is a short, standalone "
    "sentence. Every field is mandatory: if the trader's description doesn't cover it, infer "
    "a sensible default consistent with their chosen archetype and prefix that bullet with "
    "'Assumed:' so it's clear it wasn't explicitly stated. Be concrete — pull specifics from "
    "what the trader wrote rather than generic advice."
)


class StrategyPlaybook(BaseModel):
    """Structured playbook the strategist agent fills out — every field is mandatory
    (see STRATEGIST_SYSTEM_PROMPT) so every StrategyNote.structured_summary has the
    same shape for both the Strategy tab UI and the Analyst's prompt context."""

    goal: list[str] = Field(description="1-3 short bullets on the trader's overall goal/edge")
    entry_rules: list[str] = Field(description="1-3 short bullets on entry setup/triggers")
    risk_rules: list[str] = Field(description="1-3 short bullets on position sizing/stop rules")
    timeframe: list[str] = Field(description="1-3 short bullets on typical holding period")
    avoid: list[str] = Field(description="1-3 short bullets on what to avoid")


async def asummarize_strategy(archetype: str | None, body: str) -> dict:
    """One-shot distillation of the Strategy tab's archetype + free-form body into a
    structured playbook (see StrategyPlaybook)."""
    label = archetype_name(archetype) or "no specific archetype"
    prompt = f"Chosen archetype: {label}\n\nTrader's own description:\n{body}"
    model = _base_model().with_structured_output(StrategyPlaybook)
    result = await model.ainvoke([SystemMessage(STRATEGIST_SYSTEM_PROMPT), HumanMessage(prompt)])
    return result.model_dump()


RULES_SYSTEM_PROMPT = (
    "You are a trading strategist. A trader has described their strategy in their own "
    "words. Extract only the parts that are checkable against price data into a "
    "structured rule set (StrategyRuleSet) — do not invent rules the trader didn't "
    "describe. Available indicators: close, open, high, low, sma_N, ema_N, rsi_N, macd, "
    "macd_signal (N = a period, e.g. sma_50), and their Heikin Ashi equivalents prefixed "
    "ha_ (ha_close, ha_open, ha_high, ha_low, ha_sma_N, ha_ema_N, ha_rsi_N, ha_macd). "
    "Comparators: <, <=, >, >=, ==, crosses_above, crosses_below. A rule's 'right' side "
    "may be a plain number (e.g. '30') or another indicator key (e.g. 'ema_100') — use an "
    "indicator on both sides to compare two series directly, such as 'ha_close "
    "crosses_above ema_100'. Give each rule a short plain-English description. If the "
    "trader's strategy has no checkable technical condition (e.g. it's purely "
    "discretionary), return empty entry_rules and exit_rules rather than guessing."
)


async def acompile_rules(archetype: str | None, body: str) -> StrategyRuleSet:
    """Turns the trader's strategy text into a deterministic rule set (see rule_engine.py),
    so future live evaluation doesn't need an LLM call per candle."""
    label = archetype_name(archetype) or "no specific archetype"
    prompt = f"Chosen archetype: {label}\n\nTrader's own description:\n{body}"
    model = _base_model().with_structured_output(StrategyRuleSet)
    return await model.ainvoke([SystemMessage(RULES_SYSTEM_PROMPT), HumanMessage(prompt)])
