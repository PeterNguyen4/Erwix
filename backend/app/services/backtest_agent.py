import asyncio
import logging
import re
from datetime import date

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langchain_core.tools import BaseTool, tool
from langchain_ollama import ChatOllama
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.schemas_backtest import BacktestConfig, BacktestResult
from app.services.agent_graph import ANALYST_MODEL

logger = logging.getLogger("entro.backtest_agent")


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


async def _safe_tool_call(t: BaseTool, args: dict) -> str:
    """Isolate tool errors to preserve chat."""
    try:
        return str(await t.ainvoke(args))
    except Exception as exc:  # noqa: BLE001
        logger.warning("backtest delegate tool %r failed: %s", t.name, exc)
        return f"Couldn't complete that: {exc}"


DELEGATE_SYSTEM_PROMPT = (
    "You are uWick, helping a trader build a backtest config. Most messages are instructions "
    "to edit the config, but if the trader is instead asking a question about their stated "
    "strategy, asking for a market/news read, or asking about the results of a backtest they "
    "already ran, call the matching tool instead of trying to force it into a config edit. Only "
    "call a tool when the message is clearly that kind of question — otherwise call nothing."
)


def _make_ask_strategy_tool(db: AsyncSession, user_id: int) -> BaseTool:
    @tool
    async def ask_strategy(question: str) -> str:
        """The trader is asking a judgment-call question about their own stated strategy —
        e.g. 'does this fit my strategy', 'what's my risk rule again' — not asking to edit
        the config."""
        from app.services.strategy_agent import answer_strategy_question

        return await answer_strategy_question(db, user_id, question)

    return ask_strategy


def _make_ask_news_tool(db: AsyncSession, user_id: int, default_symbol: str) -> BaseTool:
    @tool
    async def ask_news(symbol: str | None = None) -> str:
        """The trader is asking for a news/market read, not a config edit. symbol defaults to
        the backtest's own symbol if not given."""
        from app.services.news import fetch_news
        from app.services.news_agent import build_market_insight

        sym = (symbol or default_symbol).upper()
        articles = await fetch_news([sym], limit_per_symbol=6)
        if not articles:
            return f"No recent headlines found for {sym}."
        insight = await build_market_insight(db, user_id, articles)
        lines = [f"Sentiment: {insight.sentiment}", f"Advice: {insight.advice}"]
        if insight.rationale:
            lines.append("Rationale: " + "; ".join(insight.rationale))
        return "\n".join(lines)

    return ask_news


def _make_ask_report_tool(result: BacktestResult | None) -> BaseTool:
    @tool
    async def ask_report(question: str) -> str:
        """The trader is asking about the results of a backtest they already ran (win rate,
        drawdown, a specific trade, the equity curve) — not a config edit."""
        if result is None:
            return "No backtest has been run yet in this session — nothing to report on."
        stats_block = "\n".join(f"{k}: {v}" for k, v in result.stats.items())
        prompt = (
            f"Backtest stats:\n{stats_block}\n\n{len(result.trades)} trades total.\n\n"
            f"Question: {question}"
        )
        model = _base_model()
        response = await model.ainvoke(
            [
                SystemMessage(
                    "You are a backtest analyst. Answer concisely (2-3 sentences) using only the "
                    "stats given — don't invent numbers not present."
                ),
                HumanMessage(prompt),
            ]
        )
        return _content_text(response)

    return ask_report


def _content_text(response) -> str:
    content = response.content
    if isinstance(content, list):
        content = "".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return content.strip().strip('"“”')


async def astream_config_chat(
    db: AsyncSession,
    user_id: int,
    current_config: BacktestConfig,
    message: str,
    window_start: str | None = None,
    window_end: str | None = None,
    last_result: BacktestResult | None = None,
    history: list[tuple[str, str]] | None = None,
):
    history_messages: list[AnyMessage] = [
        HumanMessage(content) if role == "user" else AIMessage(content) for role, content in history or []
    ]

    delegate_tools = [
        _make_ask_strategy_tool(db, user_id),
        _make_ask_news_tool(db, user_id, current_config.symbol),
        _make_ask_report_tool(last_result),
    ]
    tools_by_name = {t.name: t for t in delegate_tools}
    delegate_model = _base_model().bind_tools(delegate_tools)
    delegate_response = await delegate_model.ainvoke(
        [SystemMessage(DELEGATE_SYSTEM_PROMPT), *history_messages, HumanMessage(message)]
    )
    delegate_calls = getattr(delegate_response, "tool_calls", None) or []
    if delegate_calls:
        answers = await asyncio.gather(
            *(_safe_tool_call(tools_by_name[call["name"]], call["args"]) for call in delegate_calls)
        )
        yield {"type": "token", "text": "\n\n".join(answers)}
        yield {"type": "done"}
        return

    verb = "Build" if _is_blank_config(current_config) else "Edit"
    prompt = (
        f"Today's date: {date.today().isoformat()}\n"
        f"Current config:\n{current_config.model_dump_json()}\n"
        f"Current window: start={window_start}, end={window_end}\n\n"
        f"Instruction:\n{message}"
    )

    structured_model = _base_model().with_structured_output(_ChatEditResult, method="function_calling")
    try:
        result = await structured_model.ainvoke([SystemMessage(SYSTEM_PROMPT), *history_messages, HumanMessage(prompt)])
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
