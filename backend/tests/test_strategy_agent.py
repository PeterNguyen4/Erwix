from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models import StrategyNote
from app.schemas_strategy import StrategyRule, StrategyRuleSet
from app.services.strategy_agent import (
    RULE_COMPILE_RETRY_TEMPERATURES,
    TradingPreferences,
    acompile_rules,
    aextract_preferences,
    answer_strategy_question,
    asummarize_strategy,
    get_strategy_context,
)
from tests.conftest import make_user


def _fake_structured_model(*return_values):
    """A _base_model() stand-in whose .with_structured_output(...).ainvoke(...)
    returns each of return_values in sequence across successive calls."""
    model = MagicMock()
    model.with_structured_output.return_value = model
    model.ainvoke = AsyncMock(side_effect=list(return_values))
    return model


@pytest.mark.asyncio
async def test_get_strategy_context_none_when_no_active_strategy(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    ctx = await get_strategy_context(db_session, 1)
    assert ctx is None


@pytest.mark.asyncio
async def test_get_strategy_context_renders_structured_summary(db_session):
    import json

    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        StrategyNote(
            user_id=1, name="Main", archetype="trend_rider", is_active=True,
            structured_summary=json.dumps({"goal": ["ride trends"], "entry_rules": [], "risk_rules": [], "timeframe": [], "avoid": []}),
        )
    )
    await db_session.commit()

    ctx = await get_strategy_context(db_session, 1)
    assert ctx is not None
    label, rendered = ctx
    assert label == "Trend Rider"
    assert "ride trends" in rendered


@pytest.mark.asyncio
async def test_get_strategy_context_falls_back_to_legacy_plaintext(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    db_session.add(
        StrategyNote(user_id=1, name="Main", archetype=None, is_active=True, structured_summary="just plain text, not json")
    )
    await db_session.commit()

    ctx = await get_strategy_context(db_session, 1)
    assert ctx is not None
    _, rendered = ctx
    assert rendered == "just plain text, not json"


@pytest.mark.asyncio
async def test_asummarize_strategy_returns_playbook_dict():
    from app.services.strategy_agent import StrategyPlaybook

    playbook = StrategyPlaybook(goal=["g"], entry_rules=["e"], risk_rules=["r"], timeframe=["t"], avoid=["a"])
    fake_model = _fake_structured_model(playbook)

    with patch("app.services.strategy_agent._base_model", return_value=fake_model):
        result = await asummarize_strategy("trend_rider", "I ride trends")

    assert result["goal"] == ["g"]


@pytest.mark.asyncio
async def test_aextract_preferences_returns_trading_preferences():
    prefs = TradingPreferences(symbols=["TSLA"], context_timeframe="1Hour", entry_timeframe="15Min")
    fake_model = _fake_structured_model(prefs)

    with patch("app.services.strategy_agent._base_model", return_value=fake_model):
        result = await aextract_preferences("trend_rider", "I trade Tesla on the 15 min after checking the hourly")

    assert result.symbols == ["TSLA"]
    assert result.context_timeframe == "1Hour"


@pytest.mark.asyncio
async def test_answer_strategy_question_returns_first_answer_when_valid():
    class _Resp:
        content = "You trade breakouts on the 5 minute chart."

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(return_value=_Resp())

    with (
        patch("app.services.strategy_agent._base_model", return_value=fake_llm),
        patch("app.services.strategy_agent._validate_answer", new=AsyncMock(return_value=None)),
        patch("app.services.strategy_agent.get_strategy_context", new=AsyncMock(return_value=None)),
    ):
        answer = await answer_strategy_question(db=MagicMock(), user_id=1, question="what's my entry?")

    assert answer == "You trade breakouts on the 5 minute chart."


@pytest.mark.asyncio
async def test_answer_strategy_question_retries_once_on_invalid_critique():
    class _Resp:
        def __init__(self, text):
            self.content = text

    fake_llm = MagicMock()
    fake_llm.ainvoke = AsyncMock(side_effect=[_Resp("generic advice"), _Resp("your actual rule")])

    with (
        patch("app.services.strategy_agent._base_model", return_value=fake_llm),
        patch(
            "app.services.strategy_agent._validate_answer",
            new=AsyncMock(side_effect=["too generic", None]),
        ) as mock_validate,
        patch("app.services.strategy_agent.get_strategy_context", new=AsyncMock(return_value=None)),
    ):
        answer = await answer_strategy_question(db=MagicMock(), user_id=1, question="what's my entry?")

    assert answer == "your actual rule"
    assert mock_validate.await_count == 2


@pytest.mark.asyncio
async def test_acompile_rules_returns_result_on_first_valid_attempt():
    rule_set = StrategyRuleSet(
        entry_rules=[StrategyRule(left="close", comparator=">", right="ema_20", description="above ema")],
        exit_rules=[],
    )
    fake_model = _fake_structured_model(rule_set)

    with patch("app.services.strategy_agent._base_model", return_value=fake_model):
        result = await acompile_rules("trend_rider", "buy above the 20 ema")

    assert result.entry_rules[0].description == "above ema"
    fake_model.ainvoke.assert_awaited_once()


@pytest.mark.asyncio
async def test_acompile_rules_retries_on_broken_rule_and_recovers():
    broken = StrategyRuleSet(
        entry_rules=[StrategyRule(left="close", comparator=">", right="not_a_real_indicator", description="broken")],
        exit_rules=[],
    )
    fixed = StrategyRuleSet(
        entry_rules=[StrategyRule(left="close", comparator=">", right="ema_20", description="fixed")],
        exit_rules=[],
    )
    fake_model = _fake_structured_model(broken, fixed)

    with patch("app.services.strategy_agent._base_model", return_value=fake_model):
        result = await acompile_rules("trend_rider", "buy above the 20 ema")

    assert result.entry_rules[0].description == "fixed"
    assert fake_model.ainvoke.await_count == 2


@pytest.mark.asyncio
async def test_acompile_rules_gives_up_after_all_temperatures_return_empty():
    empty = StrategyRuleSet(entry_rules=[], exit_rules=[])
    fake_model = _fake_structured_model(*([empty] * len(RULE_COMPILE_RETRY_TEMPERATURES)))

    with patch("app.services.strategy_agent._base_model", return_value=fake_model):
        result = await acompile_rules("trend_rider", "pure discretion, no checkable rules")

    assert result.entry_rules == []
    assert result.exit_rules == []
    assert fake_model.ainvoke.await_count == len(RULE_COMPILE_RETRY_TEMPERATURES)
