"""LangGraph analyst agent.

Reviews a window of a user's trades (structural window via
trade_retrieval.get_trades_window, plus semantic context via
trade_retrieval.semantic_search when a free-text query is given) and asks
Claude, through langchain-anthropic, to narrate the window and emit chart
overlays via the draw_annotations tool. Model is swappable per the
langchain chat-model interface — nothing here assumes Anthropic beyond the
node that constructs the chat model.
"""

from datetime import datetime
from typing import Annotated, AsyncIterator, Literal, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AnyMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langchain_ollama import ChatOllama
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Trade
from app.services.embeddings import build_trade_text
from app.services.trade_retrieval import get_trades_window, semantic_search

ANALYST_MODEL = "claude-opus-4-8"  # used when llm_provider == "anthropic"

SYSTEM_PROMPT = (
    "You are a trading journal analyst named uWick. You are given a window of a trader's "
    "executed fills (and, if relevant, similar past trades pulled by semantic "
    "search) and you review them like a mentor would: concise, specific, no "
    "generic encouragement. Write a short narrative, as if talking the trader "
    "through the window live."
)

# Separate follow-up turn asking the model to decide on tool calls based on the
# narrative it just wrote. Kept as its own model call (no tools bound during the
# narrative turn) because small local models (Ollama) tend to treat a tool call
# as the entire response and skip the narrative text if both are requested at once.
TOOL_FOLLOWUP_PROMPT = (
    "Based on the review you just gave, call draw_annotations for any trades worth "
    "marking on the chart, call spotlight_day for any specific calendar dates you "
    "referenced (e.g. 'last Monday'), and call zoom_to_range if you want the whiteboard "
    "chart to zoom/pan to a specific time range while you discuss it (e.g. the few days "
    "around a trade you're walking through). Call only the tools that are relevant — it's "
    "fine to call none, some, or all of them."
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
    """Highlight one or more days on the trade calendar while discussing them."""
    return f"spotlighted {len(day_keys)} day(s)"


@tool
def zoom_to_range(from_time: int, to_time: int) -> str:
    """Zoom/pan the whiteboard chart to a specific time range (unix seconds) while
    discussing it, e.g. the few days around a trade being walked through."""
    return f"zoomed to {from_time}-{to_time}"


class AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]
    user_id: str
    window_start: datetime
    window_end: datetime
    symbol: str | None
    query: str | None
    annotations: list[dict]
    primary_symbol: str | None


def _base_model() -> BaseChatModel:
    settings = get_settings()
    if settings.llm_provider == "ollama":
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
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


def _tool_model() -> BaseChatModel:
    return _base_model().bind_tools([draw_annotations, spotlight_day, zoom_to_range])


def _extract_tool_events(response) -> list[dict]:
    events: list[dict] = []
    for call in getattr(response, "tool_calls", None) or []:
        if call["name"] == "draw_annotations":
            events.append({"type": "annotations", "annotations": call["args"].get("annotations", [])})
        elif call["name"] == "spotlight_day":
            events.append(
                {
                    "type": "spotlight",
                    "day_keys": call["args"].get("day_keys", []),
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
    return events


def _primary_symbol(trades: list[Trade]) -> str | None:
    """Most-traded symbol in the window, used to pick what the whiteboard charts
    when the caller didn't pin a symbol (e.g. a multi-symbol window debrief)."""
    if not trades:
        return None
    counts: dict[str, int] = {}
    for t in trades:
        counts[t.symbol] = counts.get(t.symbol, 0) + 1
    return max(counts, key=counts.get)


def _retrieve(state: AgentState, db: Session) -> dict:
    trades = get_trades_window(db, state["user_id"], state["window_start"], state["window_end"])
    if state["symbol"]:
        trades = [t for t in trades if t.symbol == state["symbol"].upper()]

    lines = [f"- (trade_id={t.id}) {build_trade_text(t)}" for t in trades]
    context = "\n".join(lines) if lines else "No fills in this window."

    if state["query"]:
        similar = [t for t in semantic_search(db, state["user_id"], state["query"]) if t.id not in {tr.id for tr in trades}]
        if similar:
            context += "\n\nSimilar past trades (semantic match on: {!r}):\n".format(state["query"])
            context += "\n".join(f"- (trade_id={t.id}) {build_trade_text(t)}" for t in similar)

    prompt = f"Trade window {state['window_start']:%Y-%m-%d} to {state['window_end']:%Y-%m-%d}:\n{context}"
    return {
        "messages": [SystemMessage(SYSTEM_PROMPT), HumanMessage(prompt)],
        "primary_symbol": state["symbol"] or _primary_symbol(trades),
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


def build_graph(db: Session) -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("retrieve", lambda state: _retrieve(state, db))
    graph.add_node("analyze", _analyze)
    graph.add_edge(START, "retrieve")
    graph.add_edge("retrieve", "analyze")
    graph.add_edge("analyze", END)
    return graph.compile()


def run_review(
    db: Session,
    user_id: str,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None = None,
    query: str | None = None,
) -> tuple[str, list[dict]]:
    """Run the analyst graph and return (narrative, annotations)."""
    app = build_graph(db)
    result = app.invoke(
        {
            "messages": [],
            "user_id": user_id,
            "window_start": window_start,
            "window_end": window_end,
            "symbol": symbol,
            "query": query,
            "annotations": [],
            "primary_symbol": None,
        }
    )
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


async def astream_review(
    db: Session,
    user_id: str,
    window_start: datetime,
    window_end: datetime,
    symbol: str | None = None,
    query: str | None = None,
) -> AsyncIterator[dict]:
    """Stream the analyst's debrief for a trade window.

    Yields typed events consumed directly by the /api/agent/debrief WebSocket:
    {"type": "token", "text": ...} as the narrative is generated, then one
    {"type": "annotations", ...} / {"type": "spotlight", ...} per tool call
    once the model finishes, and finally {"type": "done"}.
    """
    state: AgentState = {
        "messages": [],
        "user_id": user_id,
        "window_start": window_start,
        "window_end": window_end,
        "symbol": symbol,
        "query": query,
        "annotations": [],
        "primary_symbol": None,
    }
    retrieved = _retrieve(state, db)
    messages = retrieved["messages"]

    # Emit symbol for whiteboard, or fall back to whatever was traded most
    if not symbol and retrieved["primary_symbol"]:
        yield {"type": "symbol", "symbol": retrieved["primary_symbol"]}

    # Phase 1: stream the narrative with no tools bound, so the model can't
    # short-circuit into a bare tool call and skip the text (see TOOL_FOLLOWUP_PROMPT).
    narrative_model = _base_model()
    accumulated = None
    async for chunk in narrative_model.astream(messages):
        delta = _text_delta(chunk)
        if delta:
            yield {"type": "token", "text": delta}
        accumulated = chunk if accumulated is None else accumulated + chunk

    # Phase 2: a follow-up turn, tools bound, asking the model to act on what
    # it just said.
    followup_messages = [*messages, accumulated, HumanMessage(TOOL_FOLLOWUP_PROMPT)]
    tool_response = await _tool_model().ainvoke(followup_messages)
    for event in _extract_tool_events(tool_response):
        yield event

    yield {"type": "done"}
