"""Config-chat agent: turns plain text into a BacktestConfig patch.
"""

import re
from datetime import date

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from app.config import get_settings
from app.schemas_backtest import BacktestConfig
from app.services.agent_graph import ANALYST_MODEL


class _ChatEditResult(BaseModel):
    config: BacktestConfig
    window_start: str | None = Field(
        None,
        description="ISO date YYYY-MM-DD to set as the backtest's start date, only if "
        "the trader explicitly asked to change it — otherwise null.",
    )
    window_end: str | None = Field(
        None,
        description="ISO date YYYY-MM-DD to set as the backtest's end date, only if "
        "the trader explicitly asked to change it — otherwise null.",
    )

SYSTEM_PROMPT = (
    "You are uWick, helping a trader build a backtest config by editing a structured "
    "rule set from plain-text descriptions (e.g. 'buy when RSI drops below 30, sell "
    "when it crosses back above 70'). You are given the current config as JSON and the "
    "trader's latest instruction. Return the full updated config — carry over any "
    "existing fields the instruction didn't touch rather than dropping them. "
    "entry_rules/exit_rules each hold a mix of rule types, discriminated by 'type': "
    "comparison, pattern, gated.\n\n"
    "COMPARISON ({\"type\": \"comparison\", indicator, comparator, value}): available "
    "indicators are close, open, high, low, sma_N, ema_N, rsi_N, macd, macd_signal, "
    "stoch_k_N, stoch_d_N (stochastics), trend_strength_N (categorical, 0=weak, 1=strong), "
    "color, body_ratio, upper_wick_ratio, lower_wick_ratio (per-candle shape, "
    "color: 0=red/1=green), and their Heikin Ashi equivalents prefixed ha_. Comparators: "
    "<, <=, >, >=, ==, crosses_above, crosses_below. value is a string — either a numeric "
    "threshold (e.g. \"30\") or another indicator key (e.g. \"sma_50\") to compare two "
    "indicators directly, like 'close crosses above the 50-period SMA' -> "
    "{\"type\": \"comparison\", \"indicator\": \"close\", \"comparator\": \"crosses_above\", "
    "\"value\": \"sma_50\"}.\n\n"
    "PATTERN ({\"type\": \"pattern\", source, steps, description}): matches a sequence of "
    "consecutive candles by shape when the trader describes a multi-candle setup. source "
    "is \"ha\" or \"candle\"; steps is an ordered list (last = current bar) of "
    "{color: \"green\"|\"red\", min_body_ratio?, max_upper_wick_ratio?, "
    "max_lower_wick_ratio?}, only setting ratio fields the trader actually implied.\n\n"
    "GATED ({\"type\": \"gated\", condition, gate, description}): 'X only counts when Y is "
    "also true' — condition is a comparison or pattern rule, gate is always a comparison "
    "rule; both must hold on the same bar.\n\n"
    "stop_loss and take_profit are each either null "
    "or an object shaped {\"value\": <percent>} where <percent> is a positive number "
    "(e.g. a 4% stop loss is {\"value\": 4}, never a negative number or a bare float).\n\n"
    "You also control the backtest's date range via window_start/window_end (ISO "
    "YYYY-MM-DD), separate from the rule config — set one or both only if the trader "
    "explicitly asked to change the start/end date (absolute, like '2/5', or relative, "
    "like 'last 6 months' — resolve relative dates against today's date given below), "
    "otherwise leave them null. If the trader's instruction doesn't correspond to any "
    "field you control (entry/exit rules, stop_loss, take_profit, position_sizing, "
    "symbol, timeframe, direction, name, window_start, window_end), return the config "
    "completely unchanged and leave window_start/window_end null — don't invent a field "
    "to touch."
)

_JSON_OR_FENCE = re.compile(r"```|\{")


def _sanitize_ack(text: str) -> str:
    """Weaker local models sometimes ignore the 'one short sentence' instruction and
    dump the whole updated config as commentary — cut that off before it reaches chat."""
    text = text.strip().strip('"“”')
    match = _JSON_OR_FENCE.search(text)
    if match:
        text = text[: match.start()].strip()
    first_line = text.splitlines()[0] if text else ""
    return first_line or "Updating your strategy…"


def _base_model() -> BaseChatModel:
    settings = get_settings()
    if settings.llm_provider == "ollama":
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            num_predict=400,
        )
    if settings.llm_provider == "anthropic":
        if not settings.has_anthropic_creds:
            raise RuntimeError("Anthropic API key not configured")
        return ChatAnthropic(
            model=ANALYST_MODEL,
            api_key=settings.anthropic_api_key,
            max_tokens=2048,
            thinking={"type": "adaptive"},
        )
    if settings.llm_provider == "openrouter":
        if not settings.has_openrouter_creds:
            raise RuntimeError("OpenRouter API key not configured")
        return ChatOpenAI(
            model=settings.openrouter_model,
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            max_tokens=2048,
        )
    raise RuntimeError(f"Unknown llm_provider: {settings.llm_provider!r}")


def _is_blank_config(config: BacktestConfig) -> bool:
    return (
        not config.entry_rules
        and not config.exit_rules
        and config.stop_loss is None
        and config.take_profit is None
    )


def _changed_card(
    before: BacktestConfig,
    after: BacktestConfig,
    window_before: tuple[str | None, str | None],
    window_after: tuple[str | None, str | None],
) -> str | None:
    """Which plan card the edit actually touched, in the same priority order the cards
    are laid out in the UI — None means nothing changed (instruction was out of scope)."""
    if before.entry_rules != after.entry_rules:
        return "Entry"
    if before.exit_rules != after.exit_rules:
        return "Exit"
    if before.stop_loss != after.stop_loss or before.take_profit != after.take_profit:
        return "Risk"
    if before.position_sizing != after.position_sizing:
        return "Scale"
    if before.symbol != after.symbol or before.timeframe != after.timeframe:
        return "Preferences"
    if window_before != window_after:
        return "Window"
    if (
        before.name != after.name
        or before.direction != after.direction
        or before.max_concurrent_positions != after.max_concurrent_positions
    ):
        return "Plan"
    return None


def _content_text(response) -> str:
    content = response.content
    if isinstance(content, list):
        content = "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return content.strip().strip('"“”')


async def astream_config_chat(
    current_config: BacktestConfig,
    message: str,
    window_start: str | None = None,
    window_end: str | None = None,
):
    verb = "Build" if _is_blank_config(current_config) else "Edit"
    prompt = (
        f"Today's date: {date.today().isoformat()}\n"
        f"Current config:\n{current_config.model_dump_json()}\n"
        f"Current window: start={window_start}, end={window_end}\n\n"
        f"Instruction:\n{message}"
    )

    structured_model = _base_model().with_structured_output(_ChatEditResult, method="function_calling")
    try:
        result = await structured_model.ainvoke([SystemMessage(SYSTEM_PROMPT), HumanMessage(prompt)])
    except Exception as exc:  # noqa: BLE001 — model returned a shape we can't coerce
        yield {"type": "error", "detail": f"Couldn't apply that change: {exc}"}
        return

    new_config = result.config
    new_window_start = result.window_start or window_start
    new_window_end = result.window_end or window_end
    card = _changed_card(
        current_config, new_config, (window_start, window_end), (new_window_start, new_window_end)
    )
    model = _base_model()

    if card is None:
        explain_response = await model.ainvoke(
            [
                SystemMessage(
                    SYSTEM_PROMPT + " Nothing in the config actually changed for this instruction. "
                    "In one short sentence, explain why you couldn't apply it. Do not wrap your "
                    "reply in quotation marks."
                ),
                HumanMessage(prompt),
            ]
        )
        yield {"type": "token", "text": _sanitize_ack(_content_text(explain_response))}
        yield {"type": "done"}
        return

    yield {"type": "action", "label": f"{verb} {card}"}

    ack_response = await model.ainvoke(
        [
            SystemMessage(
                SYSTEM_PROMPT + " You already applied this change. In one short sentence, past "
                "tense, acknowledge what you changed. Do not wrap your reply in quotation marks."
            ),
            HumanMessage(
                f"{prompt}\n\nUpdated config:\n{new_config.model_dump_json()}\n"
                f"Updated window: start={new_window_start}, end={new_window_end}"
            ),
        ]
    )
    yield {"type": "token", "text": _sanitize_ack(_content_text(ack_response))}
    if (new_window_start, new_window_end) != (window_start, window_end):
        yield {"type": "window", "start": new_window_start, "end": new_window_end}
    yield {"type": "config", "config": new_config.model_dump()}
    yield {"type": "done"}
