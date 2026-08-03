"""Config-chat agent: turns plain text into a BacktestConfig patch.
"""

import re

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_ollama import ChatOllama

from app.config import get_settings
from app.schemas_backtest import BacktestConfig
from app.services.agent_graph import ANALYST_MODEL

SYSTEM_PROMPT = (
    "You are uWick, helping a trader build a backtest config by editing a structured "
    "rule set from plain-text descriptions (e.g. 'buy when RSI drops below 30, sell "
    "when it crosses back above 70'). You are given the current config as JSON and the "
    "trader's latest instruction. Return the full updated config — carry over any "
    "existing fields the instruction didn't touch rather than dropping them. Available "
    "indicators: close, sma_N, ema_N, rsi_N (N = period), macd. Comparators: <, <=, >, "
    ">=, ==, crosses_above, crosses_below. stop_loss and take_profit are each either null "
    "or an object shaped {\"value\": <percent>} where <percent> is a positive number "
    "(e.g. a 4% stop loss is {\"value\": 4}, never a negative number or a bare float)."
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
    raise RuntimeError(f"Unknown llm_provider: {settings.llm_provider!r}")


def _is_blank_config(config: BacktestConfig) -> bool:
    return (
        not config.entry_rules
        and not config.exit_rules
        and config.stop_loss is None
        and config.take_profit is None
    )


async def astream_config_chat(current_config: BacktestConfig, message: str):
    """Yields a leading {"type": "action", "label": "Build"|"Edit"} (Build only when the
    config has no rules/risk yet), {"type": "token", "text": ...} deltas for a brief
    acknowledgement, then a final {"type": "config", "config": {...}} event."""
    yield {"type": "action", "label": "Build" if _is_blank_config(current_config) else "Edit"}

    model = _base_model()
    prompt = f"Current config:\n{current_config.model_dump_json()}\n\nInstruction:\n{message}"

    ack_response = await model.ainvoke(
        [
            SystemMessage(
                SYSTEM_PROMPT + " First, in one short sentence, acknowledge what you're "
                "about to change. Do not wrap your reply in quotation marks."
            ),
            HumanMessage(prompt),
        ]
    )
    ack = ack_response.content
    if isinstance(ack, list):
        ack = "".join(b.get("text", "") for b in ack if isinstance(b, dict) and b.get("type") == "text")
    yield {"type": "token", "text": _sanitize_ack(ack)}

    structured_model = _base_model().with_structured_output(BacktestConfig)
    try:
        result = await structured_model.ainvoke([SystemMessage(SYSTEM_PROMPT), HumanMessage(prompt)])
    except Exception as exc:  # noqa: BLE001 — model returned a shape we can't coerce
        yield {"type": "error", "detail": f"Couldn't apply that change: {exc}"}
        return
    yield {"type": "config", "config": result.model_dump()}
    yield {"type": "done"}
