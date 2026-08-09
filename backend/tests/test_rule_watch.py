import pytest

from app.models import StrategyNote
from app.models import StrategyRuleSet as StrategyRuleSetModel
from app.services.rule_watch import load_rule_set
from tests.conftest import make_user


@pytest.mark.asyncio
async def test_load_rule_set_none_when_not_compiled(db_session):
    db_session.add(make_user(1))
    await db_session.commit()

    result = await load_rule_set(db_session, 1)
    assert result is None


@pytest.mark.asyncio
async def test_load_rule_set_returns_compiled_rules(db_session):
    db_session.add(make_user(1))
    await db_session.commit()
    note = StrategyNote(user_id=1, name="Main")
    db_session.add(note)
    await db_session.commit()
    await db_session.refresh(note)
    db_session.add(
        StrategyRuleSetModel(
            user_id=1,
            note_id=note.id,
            rules={
                "entry_rules": [{"type": "comparison", "left": "close", "comparator": ">", "right": "100", "description": "above 100"}],
                "exit_rules": [],
            },
        )
    )
    await db_session.commit()

    result = await load_rule_set(db_session, 1)
    assert result is not None
    assert len(result.entry_rules) == 1
    assert result.entry_rules[0].description == "above 100"
