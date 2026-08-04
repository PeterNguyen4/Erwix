"""LangGraph analyst agent.

Reviews a window of a user's trades (structural window via
trade_retrieval.get_trades_window, plus semantic context via
trade_retrieval.semantic_search when a free-text query is given) and asks
Claude, through langchain-anthropic, to narrate the window and emit chart
overlays via the draw_annotations tool. Model is swappable per the
langchain chat-model interface — nothing here assumes Anthropic beyond the
node that constructs the chat model.
"""

import json
import logging
from datetime import datetime
from typing import Annotated, AsyncIterator, Literal, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, AnyMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Trade
from app.services.embeddings import build_trade_text
from app.services.strategy import archetype_name, get_active_strategy, render_playbook
from app.services.trade_retrieval import get_trades_window, primary_symbol, semantic_search

logger = logging.getLogger("entro.agent_graph")

ANALYST_MODEL = "claude-opus-4-8"  # used when llm_provider == "anthropic"

SYSTEM_PROMPT = (
    "You are a trading journal analyst named uWick. You are given a window of one of my "
    "executed fills (and, if relevant, similar past trades pulled by semantic "
    "search) and you review them like a mentor would: concise, specific, no "
    "generic encouragement. Write a short narrative, as if talking me through "
    "the window live."
)

# Separate follow-up turn asking the model to decide on tool calls based on the
# narrative it just wrote. Kept as its own model call (no tools bound during the
# narrative turn) because small local models (Ollama) tend to treat a tool call
# as the entire response and skip the narrative text if both are requested at once.
TOOL_FOLLOWUP_PROMPT = (
    "Based on the review you just gave, call draw_annotations for any trades worth "
    "marking on the chart, call spotlight_day for any specific calendar dates you "
    "referenced (e.g. 'last Monday') or spotlight_trade for a specific trade row in the "
    "journal table you referenced, and call zoom_to_range if you want the whiteboard "
    "chart to zoom/pan to a specific time range while you discuss it (e.g. the few days "
    "around a trade you're walking through). For spotlight_day and spotlight_trade, "
    "always include a short `message` (one sentence) — it's shown as a floating caption "
    "next to the highlighted element while the chat panel is minimized, so it should "
    "stand alone without the rest of the narrative. Call only the tools that are "
    "relevant — it's fine to call none, some, or all of them."
)


class AnnotationArg(BaseModel):
    type: Literal["arrow", "circle", "marker", "line"]
    time: int = Field(description="Unix seconds matching the trade's filled_at")
    price: float
    label: str | None = None
    color: str | None = None


@tool
def draw_annotations(annotations: list[AnnotationArg]) -> str:
    """Mark trades on the chart with arrows/circles/markers/lines."""
    return f"drew {len(annotations)} annotation(s)"


class SpotlightArg(BaseModel):
    day_keys: list[str] = Field(
        description="Calendar day keys, format 'YYYY-M-D' (zero-indexed month), matching the "
        "journal calendar's dayKey() — e.g. 2026-6-8 for July 8 2026."
    )
    message: str | None = None


@tool
def spotlight_day(day_keys: list[str], message: str | None = None) -> str:
    """Highlight one or more days on the trade calendar while discussing them. Only the
    first day_key is actually highlighted, so prefer calling this once per day."""
    return f"spotlighted {len(day_keys)} day(s)"


@tool
def spotlight_trade(trade_id: int, message: str | None = None) -> str:
    """Highlight a specific trade's row in the journal table while discussing it."""
    return f"spotlighted trade {trade_id}"


@tool
def zoom_to_range(from_time: int, to_time: int) -> str:
    """Zoom/pan the whiteboard chart to a specific time range (unix seconds) while
    discussing it, e.g. the few days around a trade being walked through."""
    return f"zoomed to {from_time}-{to_time}"


@tool
def quote_note(trade_id: int, text: str) -> str:
    """Quote a trade's journal note verbatim as a distinct card in the chat, instead of
    paraphrasing it into prose. `text` must be copied exactly from the trade's `notes:`
    field in context — do not summarize or reword it."""
    return f"quoted note for trade {trade_id}"


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    user_id: int
    window_start: datetime
    window_end: datetime
    symbol: str | None
    query: str | None
    annotations: list[dict]
    primary_symbol: str | None


def _initial_state(
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None,
    query: str | None,
) -> AgentState:
    return {
        "messages": [],
        "user_id": user_id,
        "window_start": window_start,
        "window_end": window_end,
        "symbol": symbol,
        "query": query,
        "annotations": [],
        "primary_symbol": None,
    }


def _base_model() -> BaseChatModel:
    settings = get_settings()
    if settings.llm_provider == "ollama":
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            # Per-trade turns only need a few sentences or a small tool call —
            # bounding generation keeps the now-per-trade loop from stalling on
            # a local model that would otherwise ramble unboundedly.
            num_predict=400,
            timeout=30,
        )
    if settings.llm_provider == "anthropic":
        if not settings.has_anthropic_creds:
            raise RuntimeError("Anthropic API key not configured")
        return ChatAnthropic(
            model=ANALYST_MODEL,
            api_key=settings.anthropic_api_key,
            max_tokens=2048,
            thinking={"type": "adaptive"},
            timeout=30,
            max_retries=1,
        )
    raise RuntimeError(f"Unknown llm_provider: {settings.llm_provider!r}")


def _tool_model() -> BaseChatModel:
    return _base_model().bind_tools(
        [draw_annotations, spotlight_day, spotlight_trade, zoom_to_range, quote_note]
    )


def _extract_tool_events(response) -> list[dict]:
    """Normalizes tool calls into the events streamed over the debrief WS. Both
    spotlight tools collapse to the same {"type": "spotlight", "selector", "message"}
    shape — the frontend just needs a CSS selector to point at, it doesn't care
    whether the target was a calendar day or a journal trade row."""
    raw_calls = getattr(response, "tool_calls", None) or []
    logger.info("tool-call turn: %s", [c["name"] for c in raw_calls] or "(none)")
    events: list[dict] = []
    for call in raw_calls:
        if call["name"] == "draw_annotations":
            events.append({"type": "annotations", "annotations": call["args"].get("annotations", [])})
        elif call["name"] == "spotlight_day":
            day_keys = call["args"].get("day_keys", [])
            if day_keys:
                events.append(
                    {
                        "type": "spotlight",
                        "selector": f'[data-daykey="{day_keys[0]}"]',
                        "message": call["args"].get("message"),
                    }
                )
        elif call["name"] == "spotlight_trade":
            trade_id = call["args"].get("trade_id")
            if trade_id is not None:
                events.append(
                    {
                        "type": "spotlight",
                        "selector": f'[data-tradeid="{trade_id}"]',
                        "message": call["args"].get("message"),
                    }
                )
        elif call["name"] == "zoom_to_range":
            events.append(
                {
                    "type": "zoom",
                    "from": call["args"].get("from_time"),
                    "to": call["args"].get("to_time"),
                }
            )
        elif call["name"] == "quote_note":
            text = call["args"].get("text")
            trade_id = call["args"].get("trade_id")
            if text and trade_id is not None:
                events.append({"type": "note_quote", "trade_id": trade_id, "text": text})
    return events


async def _system_prompt(db: AsyncSession, user_id: int) -> str:
    """Base analyst system prompt, plus the trader's own stated strategy
    (Strategy tab) when one exists, so the review can reference whether the
    trader is following their own rules."""
    strategy = await get_active_strategy(db, user_id)
    if strategy and strategy.structured_summary:
        try:
            rendered = render_playbook(json.loads(strategy.structured_summary))
        except (json.JSONDecodeError, TypeError, AttributeError):
            rendered = strategy.structured_summary  # legacy plain-text summary, pre-JSON playbooks
        label = archetype_name(strategy.archetype) or "Custom"
        return (
            f"{SYSTEM_PROMPT}\n\nThe trader's stated strategy ({label}):\n"
            f"{rendered}\n\nWhen relevant, note whether the trades in this "
            "window align with or drift from this strategy — don't force the comparison into "
            "every trade if it doesn't add anything."
        )
    return SYSTEM_PROMPT


async def _retrieve(state: AgentState, db: AsyncSession) -> dict:
    trades = await get_trades_window(db, state["user_id"], state["window_start"], state["window_end"])
    if state["symbol"]:
        trades = [t for t in trades if t.symbol == state["symbol"].upper()]

    lines = [f"- (trade_id={t.id}) {build_trade_text(t)}" for t in trades]
    context = "\n".join(lines) if lines else "No fills in this window."

    if state["query"]:
        found = await semantic_search(db, state["user_id"], state["query"])
        similar = [t for t in found if t.id not in {tr.id for tr in trades}]
        if similar:
            context += "\n\nSimilar past trades (semantic match on: {!r}):\n".format(state["query"])
            context += "\n".join(f"- (trade_id={t.id}) {build_trade_text(t)}" for t in similar)

    prompt = f"Trade window {state['window_start']:%Y-%m-%d} to {state['window_end']:%Y-%m-%d}:\n{context}"
    return {
        "messages": [SystemMessage(await _system_prompt(db, state["user_id"])), HumanMessage(prompt)],
        "primary_symbol": state["symbol"] or primary_symbol(trades),
        "trades": trades,
    }


def _analyze(state: AgentState) -> dict:
    narrative_response = _base_model().invoke(state["messages"])
    followup_messages = [*state["messages"], narrative_response, HumanMessage(TOOL_FOLLOWUP_PROMPT)]
    tool_response = _tool_model().invoke(followup_messages)

    annotations: list[dict] = []
    for event in _extract_tool_events(tool_response):
        if event["type"] == "annotations":
            annotations.extend(event["annotations"])
    return {"messages": [narrative_response], "annotations": annotations}


def build_graph(db: AsyncSession) -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", lambda state: _retrieve(state, db))
    graph.add_node("analyze", _analyze)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "analyze")
    graph.add_edge("analyze", END)
    return graph.compile()


async def run_review(
    db: AsyncSession,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None = None,
    query: str | None = None,
) -> tuple[str, list[dict]]:
    """Run the analyst graph and return (narrative, annotations)."""
    app = build_graph(db)
    result = await app.ainvoke(_initial_state(user_id, window_start, window_end, symbol, query))
    narrative = result["messages"][-1].content
    if isinstance(narrative, list):
        narrative = "".join(block.get("text", "") for block in narrative if isinstance(block, dict))
    return narrative, result["annotations"]


def _text_delta(chunk) -> str:
    """Pull the incremental text out of an AIMessageChunk, whose .content is
    either a plain string or a list of Anthropic content blocks (text/tool_use)."""
    content = chunk.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            block.get("text", "") for block in content if isinstance(block, dict) and block.get("type") == "text"
        )
    return ""


async def _stream_narrative(model: BaseChatModel, messages: list[AnyMessage]):
    """Streams a narrative turn, yielding ("token", text) as text arrives and
    finally ("done", accumulated_chunk_or_None).

    Small local models sometimes wrap their whole reply in a stray leading/
    trailing `"` (quoting themselves as if narrating in dialogue). Since we
    can't know a token is the *last* one until the stream ends, this holds
    back one token behind the cursor (a one-token lookahead buffer) so the
    final flush can strip a trailing quote — and strips a leading quote off
    the very first token — without sacrificing incremental streaming for
    everything in between.
    """
    pending: str | None = None
    is_first = True
    accumulated = None
    async for chunk in model.astream(messages):
        delta = _text_delta(chunk)
        accumulated = chunk if accumulated is None else accumulated + chunk
        if not delta:
            continue
        if is_first:
            delta = delta.lstrip().lstrip('"“')
            is_first = False
        if pending is not None:
            yield ("token", pending)
        pending = delta
    if pending is not None:
        pending = pending.rstrip()
        if pending.endswith('"') or pending.endswith("”"):
            pending = pending[:-1]
        if pending:
            yield ("token", pending)
    yield ("done", accumulated)


PER_TRADE_TOOL_PROMPT = (
    "For trade_id={trade_id} ({side} at ${price}, filled_at unix seconds {filled_at}) — the "
    "trade you just discussed — you MUST call both of these:\n"
    "1. draw_annotations: one annotation, type='arrow' at time={filled_at}, price={price}, "
    "color green if side=buy / red if side=sell, with a 2-4 word label.\n"
    "2. zoom_to_range: from_time/to_time bracketing a window around {filled_at} (e.g. a few "
    "days before and after on a daily chart) so the whiteboard focuses on this trade.\n"
    "Then, only if it adds something beyond the chart marker, optionally call spotlight_trade "
    "(this journal row) or spotlight_day (its calendar day) with a short standalone `message` "
    "(one sentence) — skip it if the chart annotation already says enough. If this trade has "
    "a `notes:` field in context and you're referencing what I wrote in my own words (not "
    "paraphrasing your interpretation of it), call quote_note with the exact text copied "
    "from `notes:` — don't retype it into the narrative itself."
)


def _step_from_tool_events(trade: Trade, narrative: str, events: list[dict]) -> dict:
    """Assemble one DebriefReport.steps entry from a trade's narrative + tool events."""
    step: dict = {"trade_id": trade.id, "narrative": narrative, "annotations": []}
    for event in events:
        if event["type"] == "annotations":
            step["annotations"].extend(event["annotations"])
        elif event["type"] == "spotlight":
            step["spotlight"] = {"selector": event["selector"], "message": event.get("message")}
        elif event["type"] == "zoom":
            step["zoom"] = {"from": event["from"], "to": event["to"]}
        elif event["type"] == "note_quote":
            step["note_quote"] = {"trade_id": event["trade_id"], "text": event["text"]}
    return step


async def agenerate_steps(
    db: AsyncSession,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None = None,
    query: str | None = None,
) -> AsyncIterator[dict]:
    """Non-streaming counterpart to astream_review, used by the background debrief
    job (app.services.debrief_jobs): runs the same per-trade narrative+tool turns,
    but yields one finished step dict per trade (see _step_from_tool_events) instead
    of token-level events, so a caller can persist DebriefReport.steps incrementally
    without needing a live connection."""
    state = _initial_state(user_id, window_start, window_end, symbol, query)
    retrieved = await _retrieve(state, db)
    context_messages = retrieved["messages"]
    trades: list[Trade] = retrieved["trades"]

    narrative_model = _base_model()
    tool_model = _tool_model()

    conversation: list[AnyMessage] = list(context_messages)
    for trade in sorted(trades, key=lambda t: t.filled_at):
        focus_prompt = HumanMessage(
            f"Now talk through trade_id={trade.id} specifically ({build_trade_text(trade)}), "
            "2-4 sentences, as a continuous live talk-through — don't restate trades you "
            "already covered. Do not wrap your reply in quotation marks."
        )
        turn_messages = [*conversation, focus_prompt]
        narrative_response = await narrative_model.ainvoke(turn_messages)
        narrative = narrative_response.content
        if isinstance(narrative, list):
            narrative = "".join(b.get("text", "") for b in narrative if isinstance(b, dict) and b.get("type") == "text")
        narrative = narrative.strip().strip('"“”')
        conversation = [*turn_messages, narrative_response]

        tool_prompt = PER_TRADE_TOOL_PROMPT.format(
            trade_id=trade.id,
            side=trade.side,
            price=trade.fill_price,
            filled_at=int(trade.filled_at.timestamp()),
        )
        tool_response = await tool_model.ainvoke([*conversation, HumanMessage(tool_prompt)])
        events = _extract_tool_events(tool_response)
        yield _step_from_tool_events(trade, narrative, events)


EXIT_GUIDANCE_SYSTEM_PROMPT = (
    "You are uWick, a trading mentor watching a trader's open position live. Their "
    "stop-loss or take-profit level was just breached. Give exit guidance in 1-2 "
    "sentences: direct, concrete, no hedging filler. Reference the numbers you're "
    "given rather than restating them generically."
)


async def exit_guidance(
    db: AsyncSession,
    user_id: int,
    symbol: str,
    level_hit: str,
    price: float,
    entry_price: float,
    stop_loss_price: float | None,
    take_profit_price: float | None,
) -> str:
    """Narrates stop-loss/take-profit just-breached for the live rule-watch loop."""
    strategy = await get_active_strategy(db, user_id)
    strategy_line = ""
    if strategy and strategy.structured_summary:
        label = archetype_name(strategy.archetype) or "Custom"
        strategy_line = f"\nTrader's stated strategy ({label}) — weigh this if it's relevant to the call."

    kind_label = "take-profit target" if level_hit == "take_profit" else "stop-loss"
    prompt = (
        f"{symbol}: {kind_label} just breached. Current price {price:.2f}, entry "
        f"{entry_price:.2f}, stop-loss {stop_loss_price if stop_loss_price is not None else 'unset'}, "
        f"take-profit {take_profit_price if take_profit_price is not None else 'unset'}."
        f"{strategy_line}"
    )
    messages: list[AnyMessage] = [SystemMessage(EXIT_GUIDANCE_SYSTEM_PROMPT), HumanMessage(prompt)]
    response = await _base_model().ainvoke(messages)
    text = response.content
    if isinstance(text, list):
        text = "".join(b.get("text", "") for b in text if isinstance(b, dict) and b.get("type") == "text")
    return text.strip().strip('"“”')


FOLLOWUP_SYSTEM_PROMPT = (
    "You are uWick, continuing a debrief conversation. The trade window and your original "
    "report are in context below. Answer the trader's follow-up question directly and "
    "specifically, grounded in the actual trades shown — don't restate the whole report. "
    "You may call draw_annotations, spotlight_day, spotlight_trade, zoom_to_range, or "
    "quote_note if referencing the chart/journal/a note helps answer the question."
)


async def arun_followup(
    db: AsyncSession,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    report_narrative: str,
    history: list[tuple[str, str]],
    message: str,
    symbol: str | None = None,
    query: str | None = None,
) -> tuple[str, list[dict]]:
    """Answer a follow-up question about an already-generated DebriefReport, grounded
    in the same trade window/retrieval context used to generate it (re-fetched here
    rather than trusting only the stored narrative, so questions about specific
    trades can still be checked against real data). `history` is prior
    (role, content) DebriefMessage pairs in order. Returns (reply_text, tool_events)."""
    state = _initial_state(user_id, window_start, window_end, symbol, query)
    retrieved = await _retrieve(state, db)
    context_messages = retrieved["messages"]

    messages: list[AnyMessage] = [
        SystemMessage(FOLLOWUP_SYSTEM_PROMPT),
        *context_messages[1:],  # skip the retrieve step's own SystemMessage, keep the trade-window HumanMessage
        AIMessage(report_narrative),
    ]
    for role, content in history:
        messages.append(HumanMessage(content) if role == "user" else AIMessage(content))
    messages.append(HumanMessage(message))

    response = await _tool_model().ainvoke(messages)
    reply = response.content
    if isinstance(reply, list):
        reply = "".join(b.get("text", "") for b in reply if isinstance(b, dict) and b.get("type") == "text")
    events = _extract_tool_events(response)
    annotation_events = [e for e in events if e["type"] == "annotations"]
    return reply.strip(), annotation_events + [e for e in events if e["type"] != "annotations"]


async def astream_review(
    db: AsyncSession,
    user_id: int,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None = None,
    query: str | None = None,
) -> AsyncIterator[dict]:
    """Stream the analyst's debrief for a trade window.

    Runs one narrative+tool turn per trade in the window (rather than one big
    narrative followed by a single trailing tool-call turn) so annotation/spotlight/
    zoom events land while the relevant text is still streaming, instead of only
    after the whole narrative has finished. Yields {"type": "token", "text": ...}
    as each trade's narration is generated, interleaved with that trade's
    {"type": "annotations"|"spotlight"|"zoom", ...} events, and finally {"type": "done"}.
    """
    state = _initial_state(user_id, window_start, window_end, symbol, query)
    retrieved = await _retrieve(state, db)
    context_messages = retrieved["messages"]
    trades: list[Trade] = retrieved["trades"]

    # Emit symbol for whiteboard, or fall back to whatever was traded most
    if not symbol and retrieved["primary_symbol"]:
        yield {"type": "symbol", "symbol": retrieved["primary_symbol"]}

    narrative_model = _base_model()
    tool_model = _tool_model()

    if not trades:
        # Nothing to loop per-trade over — fall back to a single narrative turn.
        async for kind, payload in _stream_narrative(narrative_model, context_messages):
            if kind == "token":
                yield {"type": "token", "text": payload}
        yield {"type": "done"}
        return

    conversation: list[AnyMessage] = list(context_messages)
    for i, trade in enumerate(sorted(trades, key=lambda t: t.filled_at)):
        focus_prompt = HumanMessage(
            f"Now talk through trade_id={trade.id} specifically ({build_trade_text(trade)}), "
            "2-4 sentences, as a continuous live talk-through — don't restate trades you "
            "already covered. Do not wrap your reply in quotation marks."
        )
        turn_messages = [*conversation, focus_prompt]

        if i > 0:
            yield {"type": "token", "text": "\n\n"}  # paragraph break between trades

        accumulated = None
        async for kind, payload in _stream_narrative(narrative_model, turn_messages):
            if kind == "token":
                yield {"type": "token", "text": payload}
            else:
                accumulated = payload
        if accumulated is None:
            continue  # model produced nothing for this trade — skip tool turn, keep history clean
        conversation = [*turn_messages, accumulated]

        tool_prompt = PER_TRADE_TOOL_PROMPT.format(
            trade_id=trade.id,
            side=trade.side,
            price=trade.fill_price,
            filled_at=int(trade.filled_at.timestamp()),
        )
        tool_response = await tool_model.ainvoke([*conversation, HumanMessage(tool_prompt)])
        for event in _extract_tool_events(tool_response):
            yield event

    yield {"type": "done"}
