from unittest.mock import AsyncMock, patch

import pytest

from app.schemas_strategy import StrategyRuleSet
from app.services.strategy_agent import TradingPreferences


def _mock_agents():
    return (
        patch("app.routers.strategy.asummarize_strategy", new=AsyncMock(return_value={"Setup": ["a"]})),
        patch("app.routers.strategy.acompile_rules", new=AsyncMock(return_value=StrategyRuleSet())),
        patch(
            "app.routers.strategy.aextract_preferences",
            new=AsyncMock(return_value=TradingPreferences(symbols=["AAPL"], context_timeframe=None, entry_timeframe=None)),
        ),
    )


def test_list_archetypes_returns_static_list(client):
    resp = client.get("/api/strategy/archetypes")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) > 0


def test_get_strategies_empty_by_default(client):
    resp = client.get("/api/strategy")
    assert resp.status_code == 200
    assert resp.json() == []


def test_get_active_strategy_none_by_default(client):
    resp = client.get("/api/strategy/active")
    assert resp.status_code == 200
    assert resp.json() is None


def test_create_strategy_returns_new_note(client):
    resp = client.post("/api/strategy", json={"name": "Momentum", "archetype": "momentum"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "Momentum"
    assert body["archetype"] == "momentum"


def test_get_strategy_by_id(client):
    created = client.post("/api/strategy", json={"name": "Momentum"}).json()
    resp = client.get(f"/api/strategy/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_strategy_not_found(client):
    resp = client.get("/api/strategy/99999")
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_strategy_belonging_to_another_user_is_404(client, db_session):
    from app.models import StrategyNote
    from tests.conftest import make_user

    db_session.add(make_user(2))
    await db_session.commit()
    other_note = StrategyNote(user_id=2, name="Other user's strategy")
    db_session.add(other_note)
    await db_session.commit()
    await db_session.refresh(other_note)

    resp = client.get(f"/api/strategy/{other_note.id}")
    assert resp.status_code == 404


def test_activate_strategy_marks_it_active_and_deactivates_others(client):
    a = client.post("/api/strategy", json={"name": "A"}).json()
    b = client.post("/api/strategy", json={"name": "B"}).json()

    client.post(f"/api/strategy/{a['id']}/activate")
    resp = client.post(f"/api/strategy/{b['id']}/activate")
    assert resp.status_code == 200
    assert resp.json()["is_active"] is True

    listing = {s["id"]: s["is_active"] for s in client.get("/api/strategy").json()}
    assert listing[a["id"]] is False
    assert listing[b["id"]] is True

    active = client.get("/api/strategy/active").json()
    assert active["id"] == b["id"]


def test_activate_nonexistent_strategy_404s(client):
    resp = client.post("/api/strategy/99999/activate")
    assert resp.status_code == 404


def test_rename_strategy(client):
    created = client.post("/api/strategy", json={"name": "Old Name"}).json()
    resp = client.put(f"/api/strategy/{created['id']}/name", json={"name": "New Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"


def test_delete_strategy(client):
    created = client.post("/api/strategy", json={"name": "Temp"}).json()
    resp = client.delete(f"/api/strategy/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/strategy/{created['id']}")
    assert resp.status_code == 404


def test_delete_nonexistent_strategy_404s(client):
    resp = client.delete("/api/strategy/99999")
    assert resp.status_code == 404


def test_save_strategy_regenerates_summary_rules_and_preferences(client):
    created = client.post("/api/strategy", json={"name": "Momentum", "archetype": "momentum"}).json()

    summarize, compile_rules, extract_prefs = _mock_agents()
    with summarize, compile_rules, extract_prefs as mock_prefs:
        resp = client.put(
            f"/api/strategy/{created['id']}", json={"body": "I trade AAPL breakouts on the 5min chart"}
        )
    assert resp.status_code == 200
    assert resp.json()["structured_summary"] is not None
    mock_prefs.assert_awaited_once()


def test_save_strategy_skips_regeneration_when_body_empty(client):
    created = client.post("/api/strategy", json={"name": "Momentum"}).json()

    summarize, compile_rules, extract_prefs = _mock_agents()
    with summarize as mock_summarize, compile_rules, extract_prefs:
        resp = client.put(f"/api/strategy/{created['id']}", json={"body": ""})
    assert resp.status_code == 200
    mock_summarize.assert_not_awaited()


def test_get_rules_defaults_when_never_compiled(client):
    created = client.post("/api/strategy", json={"name": "Momentum"}).json()
    resp = client.get(f"/api/strategy/{created['id']}/rules")
    assert resp.status_code == 200
    assert resp.json()["rules"] is None
    assert resp.json()["is_stale"] is False


def test_get_rules_after_regenerate(client):
    created = client.post("/api/strategy", json={"name": "Momentum"}).json()
    summarize, compile_rules, extract_prefs = _mock_agents()
    with summarize, compile_rules, extract_prefs:
        client.put(f"/api/strategy/{created['id']}", json={"body": "trade breakouts"})

    resp = client.get(f"/api/strategy/{created['id']}/rules")
    assert resp.status_code == 200
    assert resp.json()["compiled_model"] == "strategy_agent.acompile_rules"
    assert resp.json()["is_stale"] is False


def test_update_playbook_overwrites_summary_with_user_edit(client):
    import json

    created = client.post("/api/strategy", json={"name": "Momentum"}).json()
    resp = client.put(
        f"/api/strategy/{created['id']}/playbook", json={"sections": {"Setup": ["custom edit"]}}
    )
    assert resp.status_code == 200
    assert json.loads(resp.json()["structured_summary"])["Setup"] == ["custom edit"]
