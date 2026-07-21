"""Strategist agent: distills the Strategy tab's archetype + free-form body
into a structured playbook (see StrategyPlaybook), stored as JSON in
StrategyNote.structured_summary and read by agent_graph._system_prompt.

Reuses agent_graph._base_model() rather than re-deriving provider selection
(Anthropic/Ollama) here — that branching is meant to stay in one place.
"""

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

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
