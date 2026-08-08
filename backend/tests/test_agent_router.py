from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import agent_graph


class _FakeMessage:
    def __init__(self, content: str = "final answer"):
        self.content = content


class _FakeModel:
    """Records whether bind_tools was called on it, and whether it was invoked."""

    def __init__(self):
        self.bound = False
        self.invoked_with: list = []

    def bind_tools(self, tools):
        self.bound = True
        return self

    async def ainvoke(self, messages):
        self.invoked_with.append(messages)
        return _FakeMessage()


@pytest.mark.asyncio
async def test_router_plan_forces_final_answer_past_turn_cap():
    """Once tool_turns hits MAX_ROUTER_TOOL_TURNS, _router_plan must call the model
    WITHOUT bound tools (a forced final-answer turn) instead of looping forever."""
    fake_model = _FakeModel()
    with patch.object(agent_graph, "_base_model", return_value=fake_model), patch.object(
        agent_graph, "build_retrieval_tools", return_value=[]
    ):
        state = {
            "messages": [agent_graph.SystemMessage("system")],
            "user_id": 1,
            "tool_turns": agent_graph.MAX_ROUTER_TOOL_TURNS,
        }
        result = await agent_graph._router_plan(state, db=MagicMock(), user_id=1)

    assert fake_model.bound is False
    assert result["tool_turns"] == agent_graph.MAX_ROUTER_TOOL_TURNS + 1
    assert len(result["messages"]) == 1


@pytest.mark.asyncio
async def test_router_plan_binds_tools_under_turn_cap():
    fake_model = _FakeModel()
    with patch.object(agent_graph, "_base_model", return_value=fake_model), patch.object(
        agent_graph, "build_retrieval_tools", return_value=[]
    ):
        state = {
            "messages": [agent_graph.SystemMessage("system")],
            "user_id": 1,
            "tool_turns": 0,
        }
        result = await agent_graph._router_plan(state, db=MagicMock(), user_id=1)

    assert fake_model.bound is True
    assert result["tool_turns"] == 1


@pytest.mark.asyncio
async def test_arun_ask_returns_provenance_from_tool_calls():
    """arun_ask should surface every tool call made across the run as provenance,
    and pull draw_annotations calls out as annotation events."""

    class _ToolCallMessage:
        def __init__(self, content, tool_calls):
            self.content = content
            self.tool_calls = tool_calls

    final = _ToolCallMessage(
        "here's what went wrong",
        [{"name": "compare_trade_windows", "args": {"window_a_start": "2026-01-01"}}],
    )

    fake_graph = AsyncMock()
    fake_graph.ainvoke = AsyncMock(return_value={"messages": [final]})

    with patch.object(agent_graph, "build_router_graph", return_value=fake_graph):
        reply, annotations, provenance = await agent_graph.arun_ask(
            db=MagicMock(), user_id=1, question="what went wrong this week?"
        )

    assert reply == "here's what went wrong"
    assert annotations == []
    assert provenance == [{"tool": "compare_trade_windows", "args": {"window_a_start": "2026-01-01"}}]
