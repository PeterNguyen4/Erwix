from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.schemas_backtest import BacktestConfig, BacktestRisk, BacktestRule, BacktestSizing
from app.services.backtest_agent import (
    _ChatEditResult,
    _changed_card,
    _is_blank_config,
    _sanitize_ack,
    astream_config_chat,
)


def _config(**overrides) -> BacktestConfig:
    defaults = dict(symbol="AAPL", direction="long", position_sizing=BacktestSizing())
    defaults.update(overrides)
    return BacktestConfig(**defaults)


def test_sanitize_ack_strips_quotes():
    assert _sanitize_ack('"Set your stop loss to 4%."') == "Set your stop loss to 4%."


def test_sanitize_ack_cuts_off_at_json_dump():
    text = 'Updated your config. {"symbol": "AAPL", "entry_rules": []}'
    assert _sanitize_ack(text) == "Updated your config."


def test_sanitize_ack_cuts_off_at_code_fence():
    text = "Here you go\n```json\n{...}\n```"
    assert _sanitize_ack(text) == "Here you go"


def test_sanitize_ack_falls_back_to_default_on_empty():
    assert _sanitize_ack("") == "Updating your strategy…"


def test_is_blank_config_true_for_empty_rules_and_risk():
    assert _is_blank_config(_config()) is True


def test_is_blank_config_false_when_entry_rules_present():
    cfg = _config(entry_rules=[BacktestRule(indicator="close", comparator=">", value="100")])
    assert _is_blank_config(cfg) is False


def test_changed_card_detects_entry_rule_change():
    before = _config()
    after = _config(entry_rules=[BacktestRule(indicator="close", comparator=">", value="100")])
    assert _changed_card(before, after, (None, None), (None, None)) == "Entry"


def test_changed_card_detects_risk_change():
    before = _config()
    after = _config(stop_loss=BacktestRisk(value=4))
    assert _changed_card(before, after, (None, None), (None, None)) == "Risk"


def test_changed_card_detects_window_change():
    before = _config()
    after = _config()
    assert _changed_card(before, after, (None, None), ("2026-01-01", None)) == "Window"


def test_changed_card_none_when_nothing_changed():
    cfg = _config()
    assert _changed_card(cfg, cfg, (None, None), (None, None)) is None


def _tool_free_model():
    """A _base_model() stand-in with no tool calls, used for the delegate-check step."""
    m = MagicMock()
    m.bind_tools.return_value = m
    response = MagicMock()
    response.tool_calls = []
    m.ainvoke = AsyncMock(return_value=response)
    return m


@pytest.mark.asyncio
async def test_astream_config_chat_delegates_to_strategy_tool():
    call_log = []

    async def fake_ask_strategy(db, user_id, question):
        call_log.append(question)
        return "Your risk rule caps losses at 1% per trade."

    delegate_response = MagicMock()
    delegate_response.tool_calls = [{"name": "ask_strategy", "args": {"question": "what's my risk rule?"}, "id": "1"}]
    delegate_model = MagicMock()
    delegate_model.bind_tools.return_value = delegate_model
    delegate_model.ainvoke = AsyncMock(return_value=delegate_response)

    with (
        patch("app.services.backtest_agent._base_model", return_value=delegate_model),
        patch("app.services.strategy_agent.answer_strategy_question", new=fake_ask_strategy),
    ):
        events = [e async for e in astream_config_chat(
            db=MagicMock(), user_id=1, current_config=_config(), message="what's my risk rule?"
        )]

    assert call_log == ["what's my risk rule?"]
    assert events[0]["type"] == "token"
    assert "1%" in events[0]["text"]
    assert events[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_astream_config_chat_applies_config_edit():
    edited = _ChatEditResult(
        config=_config(entry_rules=[BacktestRule(indicator="close", comparator=">", value="100")]),
        window_start=None, window_end=None,
    )
    structured_model = MagicMock()
    structured_model.with_structured_output.return_value = structured_model
    structured_model.ainvoke = AsyncMock(return_value=edited)

    ack_response = MagicMock()
    ack_response.content = "Added an entry rule for close above 100."
    ack_model = MagicMock()
    ack_model.ainvoke = AsyncMock(return_value=ack_response)

    delegate_model = _tool_free_model()

    call_count = {"n": 0}

    def fake_base_model(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return delegate_model
        if call_count["n"] == 2:
            return structured_model
        return ack_model

    with patch("app.services.backtest_agent._base_model", side_effect=fake_base_model):
        events = [e async for e in astream_config_chat(
            db=MagicMock(), user_id=1, current_config=_config(), message="buy when close is above 100"
        )]

    types = [e["type"] for e in events]
    assert types == ["action", "token", "config", "done"]
    assert events[0]["label"] == "Build Entry"
    assert events[2]["config"]["entry_rules"][0]["value"] == "100"


@pytest.mark.asyncio
async def test_astream_config_chat_explains_when_nothing_changed():
    unchanged = _ChatEditResult(config=_config(), window_start=None, window_end=None)
    structured_model = MagicMock()
    structured_model.with_structured_output.return_value = structured_model
    structured_model.ainvoke = AsyncMock(return_value=unchanged)

    explain_response = MagicMock()
    explain_response.content = "That doesn't match any setting I control."
    explain_model = MagicMock()
    explain_model.ainvoke = AsyncMock(return_value=explain_response)

    delegate_model = _tool_free_model()
    call_count = {"n": 0}

    def fake_base_model(*args, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 1:
            return delegate_model
        if call_count["n"] == 2:
            return structured_model
        return explain_model

    with patch("app.services.backtest_agent._base_model", side_effect=fake_base_model):
        events = [e async for e in astream_config_chat(
            db=MagicMock(), user_id=1, current_config=_config(), message="what's the weather"
        )]

    assert [e["type"] for e in events] == ["token", "done"]


@pytest.mark.asyncio
async def test_astream_config_chat_yields_error_when_structured_output_fails():
    structured_model = MagicMock()
    structured_model.with_structured_output.return_value = structured_model
    structured_model.ainvoke = AsyncMock(side_effect=ValueError("bad shape"))

    delegate_model = _tool_free_model()
    call_count = {"n": 0}

    def fake_base_model(*args, **kwargs):
        call_count["n"] += 1
        return delegate_model if call_count["n"] == 1 else structured_model

    with patch("app.services.backtest_agent._base_model", side_effect=fake_base_model):
        events = [e async for e in astream_config_chat(
            db=MagicMock(), user_id=1, current_config=_config(), message="buy above 100"
        )]

    assert events[0]["type"] == "error"
