"""Strategist agent: distills the Strategy tab's archetype + free-form body
into a structured playbook (see StrategyPlaybook), stored as JSON in
StrategyNote.structured_summary and read by agent_graph._system_prompt.

Reuses agent_graph._base_model() rather than re-deriving provider selection
(Anthropic/Ollama) here — that branching is meant to stay in one place.
"""

from typing import Literal

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from app.schemas import Candle
from app.schemas_strategy import StrategyRuleSet
from app.services.agent_graph import _base_model
from app.services.rule_engine import evaluate_rule
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
    model = _base_model(num_predict=800).with_structured_output(StrategyPlaybook)
    result = await model.ainvoke([SystemMessage(STRATEGIST_SYSTEM_PROMPT), HumanMessage(prompt)])
    return result.model_dump()


_TIMEFRAMES = Literal["1Min", "5Min", "15Min", "1Hour", "1Day", "1Week", "1Month"]

PREFERENCES_SYSTEM_PROMPT = (
    "You are a trading strategist. A trader has described their strategy in their own "
    "words. Extract only their trading preferences — do not invent ones they didn't "
    "state. symbols: tickers they explicitly say they trade (e.g. 'I always trade "
    "Tesla' -> ['TSLA']); empty list if none mentioned, don't guess a default watchlist. "
    "entry_timeframe: the candle timeframe they actually place entries/exits on. "
    "context_timeframe: a separate, usually higher, timeframe they say they check first "
    "for broader trend/context before entering (e.g. 'I check the 1-hour premarket "
    "trend, then trade the 5 or 15 minute chart' -> context_timeframe '1Hour', "
    "entry_timeframe '15Min' — pick the finer of the two if a range is given). Leave a "
    "field null if the trader didn't state it; only one timeframe stated means "
    "entry_timeframe is that one and context_timeframe is null."
)


class TradingPreferences(BaseModel):
    symbols: list[str] = Field(description="Tickers the trader explicitly says they trade, e.g. ['TSLA']")
    context_timeframe: _TIMEFRAMES | None = Field(
        description="Higher timeframe checked for context/trend before entering, if the trader mentioned one"
    )
    entry_timeframe: _TIMEFRAMES | None = Field(
        description="The timeframe the trader actually places entries/exits on, if stated"
    )


async def aextract_preferences(archetype: str | None, body: str) -> TradingPreferences:
    label = archetype_name(archetype) or "no specific archetype"
    prompt = f"Chosen archetype: {label}\n\nTrader's own description:\n{body}"
    model = _base_model(num_predict=200).with_structured_output(TradingPreferences)
    return await model.ainvoke([SystemMessage(PREFERENCES_SYSTEM_PROMPT), HumanMessage(prompt)])


RULES_SYSTEM_PROMPT = (
    "You are a trading strategist. A trader has described their strategy in their own "
    "words. Extract only the parts that are checkable against price data into a "
    "structured rule set (StrategyRuleSet) — do not invent rules the trader didn't "
    "describe. entry_rules/exit_rules each hold a mix of three rule types, discriminated "
    "by their 'type' field: comparison, pattern, and gated.\n\n"
    "COMPARISON rules ({'type': 'comparison', left, comparator, right, description}): "
    "available indicators are close, open, high, low, sma_N, ema_N, rsi_N, macd, "
    "macd_signal, stoch_k_N, stoch_d_N (stochastics, N = lookback period, e.g. stoch_k_14), "
    "trend_strength_N (categorical trend strength derived from ADX(N)), color, body_ratio, "
    "upper_wick_ratio, lower_wick_ratio (per-candle shape), and their Heikin Ashi "
    "equivalents prefixed ha_ (ha_close, ha_stoch_k_14, ha_color, ...). Categorical "
    "indicators are encoded as numbers for '==' comparisons: trend_strength is 0 for weak, "
    "1 for strong; color is 0 for red, 1 for green (e.g. trend_strength_14 == 0 means 'weak "
    "trend'). Comparators: <, <=, >, >=, ==, crosses_above, crosses_below. 'right' may be a "
    "plain number ('30') or another indicator key ('ema_100'), letting you compare two "
    "series directly, e.g. 'ha_close crosses_above ema_100'.\n\n"
    "PATTERN rules ({'type': 'pattern', source, steps, description}) match a sequence of "
    "consecutive candles by shape — use this whenever the trader describes a multi-candle "
    "setup (e.g. 'a doji followed by two confirming candles'), not a single-bar comparison. "
    "source is 'ha' (Heikin Ashi, the usual choice when the trader mentions HA candles) or "
    "'candle' (raw OHLC). steps is an ordered list of {color: 'green'|'red', "
    "min_body_ratio?, max_upper_wick_ratio?, max_lower_wick_ratio?} — the LAST step is the "
    "current/most recent bar, the FIRST is the earliest. Only set the ratio fields the "
    "trader actually implied (e.g. 'no lower wicks' -> max_lower_wick_ratio: 0.0; 'large "
    "bodies' -> min_body_ratio: 0.6).\n\n"
    "GATED rules ({'type': 'gated', condition, gate, description}) express 'X only counts "
    "when Y is also true' — use this whenever the trader says one signal's meaning depends "
    "on another condition (e.g. a trend-strength regime changing what an indicator cross "
    "means). condition is a comparison or pattern rule; gate is always a comparison rule. "
    "Both must hold on the same bar for the gated rule to fire.\n\n"
    "Worked example — trader says: 'Use Heiken Ashi candles. In an uptrend, candles are "
    "green with large bodies and no lower wicks; downtrend is the opposite. Enter when you "
    "see a doji of the opposite color, followed by 2 candles in the opposite direction with "
    "no wicks against the new direction. Add stochastics — if it crosses below the bottom "
    "line the market is oversold. For a long entry we want a WEAK downtrend with "
    "stochastics crossing under; if the downtrend is STRONG, don't take it.' This compiles "
    "to two entry_rules: (1) a pattern rule, source 'ha', 3 steps — a doji-like green "
    "candle (no ratio constraints needed on the doji step itself) then two green candles "
    "each with max_lower_wick_ratio 0.0; (2) a gated rule whose condition is a comparison "
    "'stoch_k_14 crosses_below 20' and whose gate is 'trend_strength_14 == 0' (weak).\n\n"
    "Give every rule a short plain-English description. If the trader's strategy has no "
    "checkable technical condition (e.g. it's purely discretionary), return empty "
    "entry_rules and exit_rules rather than guessing."
)


RULE_COMPILE_RETRY_TEMPERATURES = [0.0, 0.3, 0.6]

_SYNTHETIC_CANDLE_COUNT = 250


def _synthetic_candles() -> list[Candle]:
    """Set of previous candles for malformed rules."""
    candles = []
    price = 100.0
    for i in range(_SYNTHETIC_CANDLE_COUNT):
        price += ((i * 37) % 7 - 3) * 0.4
        high = price + 1.5
        low = price - 1.5
        open_ = price - 0.5 + (i % 3) * 0.3
        candles.append(Candle(time=i, open=open_, high=high, low=low, close=price, volume=1000.0))
    return candles


def _validate_ruleset(rule_set: StrategyRuleSet) -> str | None:
    """Runs rules to check proper formatting."""
    candles = _synthetic_candles()
    for section, rules in (("entry_rules", rule_set.entry_rules), ("exit_rules", rule_set.exit_rules)):
        for rule in rules:
            try:
                for i in range(len(candles)):
                    evaluate_rule(rule, candles, i)
            except Exception as exc:  # noqa: BLE001
                return f"{section} rule {rule.description!r} failed to evaluate: {exc}"
    return None


async def acompile_rules(archetype: str | None, body: str) -> StrategyRuleSet:
    label = archetype_name(archetype) or "no specific archetype"
    prompt = f"Chosen archetype: {label}\n\nTrader's own description:\n{body}"
    messages = [SystemMessage(RULES_SYSTEM_PROMPT), HumanMessage(prompt)]

    last_result: StrategyRuleSet | None = None
    last_error: Exception | str | None = None
    for temperature in RULE_COMPILE_RETRY_TEMPERATURES:
        model = _base_model(num_predict=1500, temperature=temperature).with_structured_output(
            StrategyRuleSet, method="function_calling"
        )
        try:
            result = await model.ainvoke(messages)
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            continue

        validation_error = _validate_ruleset(result)
        if validation_error is not None:
            last_error = validation_error
            messages = messages + [
                AIMessage(result.model_dump_json()),
                HumanMessage(
                    f"That rule set doesn't load: {validation_error}. Fix only the offending "
                    "rule(s) — reuse the indicator keys and comparators listed above and keep "
                    "everything else the same."
                ),
            ]
            continue

        last_error = None
        last_result = result
        if result.entry_rules or result.exit_rules:
            return result

    if last_result is not None:
        return last_result
    if isinstance(last_error, str):
        raise ValueError(last_error)
    raise last_error
