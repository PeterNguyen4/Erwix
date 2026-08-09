from datetime import datetime, timezone
from unittest.mock import patch

import pytest

from app.schemas import Candle


def _config_payload(**overrides):
    payload = {"name": "My Plan", "symbol": "AAPL", "timeframe": "1Day"}
    payload.update(overrides)
    return payload


def test_list_configs_empty_by_default(client):
    resp = client.get("/api/backtest/configs")
    assert resp.status_code == 200
    assert resp.json() == []


def test_create_config_returns_it_with_id(client):
    resp = client.post("/api/backtest/configs", json=_config_payload())
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] is not None
    assert body["symbol"] == "AAPL"


def test_update_config(client):
    created = client.post("/api/backtest/configs", json=_config_payload()).json()
    resp = client.patch(
        f"/api/backtest/configs/{created['id']}", json=_config_payload(symbol="TSLA")
    )
    assert resp.status_code == 200
    assert resp.json()["symbol"] == "TSLA"


def test_update_nonexistent_config_404s(client):
    resp = client.patch("/api/backtest/configs/99999", json=_config_payload())
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_config_belonging_to_another_user_is_404(client, db_session):
    from app.models import BacktestConfig as BacktestConfigModel
    from tests.conftest import make_user

    db_session.add(make_user(2))
    await db_session.commit()
    other_config = BacktestConfigModel(user_id=2, name="Other", symbol="MSFT", timeframe="1Day", config={})
    db_session.add(other_config)
    await db_session.commit()
    await db_session.refresh(other_config)

    resp = client.patch(f"/api/backtest/configs/{other_config.id}", json=_config_payload())
    assert resp.status_code == 404


def test_run_config_executes_backtest_and_persists_run(client):
    created = client.post("/api/backtest/configs", json=_config_payload()).json()
    candle = Candle(time=1, open=10, high=10, low=10, close=10, volume=100)

    with patch("app.routers.backtest.alpaca_client.get_candles", return_value=[candle]):
        resp = client.post(
            f"/api/backtest/configs/{created['id']}/run",
            params={"start": "2026-01-01T00:00:00Z", "end": "2026-01-31T00:00:00Z"},
        )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ready"
    assert "stats" in body["result"]

    run_resp = client.get(f"/api/backtest/runs/{body['id']}")
    assert run_resp.status_code == 200
    assert run_resp.json()["status"] == "ready"


def test_run_config_404s_for_missing_config(client):
    resp = client.post(
        "/api/backtest/configs/99999/run",
        params={"start": "2026-01-01T00:00:00Z", "end": "2026-01-31T00:00:00Z"},
    )
    assert resp.status_code == 404


def test_run_config_maps_alpaca_runtime_error_to_503(client):
    created = client.post("/api/backtest/configs", json=_config_payload()).json()
    with patch("app.routers.backtest.alpaca_client.get_candles", side_effect=RuntimeError("no creds")):
        resp = client.post(
            f"/api/backtest/configs/{created['id']}/run",
            params={"start": "2026-01-01T00:00:00Z", "end": "2026-01-31T00:00:00Z"},
        )
    assert resp.status_code == 503


def test_get_run_not_found(client):
    resp = client.get("/api/backtest/runs/99999")
    assert resp.status_code == 404


def test_create_and_list_chat_sessions(client):
    created = client.post("/api/backtest/chat-sessions").json()
    assert created["title"] == "New chat"

    listing = client.get("/api/backtest/chat-sessions").json()
    assert any(s["id"] == created["id"] for s in listing)


def test_get_chat_session(client):
    created = client.post("/api/backtest/chat-sessions").json()
    resp = client.get(f"/api/backtest/chat-sessions/{created['id']}")
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_chat_session_not_found(client):
    resp = client.get("/api/backtest/chat-sessions/99999")
    assert resp.status_code == 404


def test_update_chat_session_autosaves_full_state(client):
    created = client.post("/api/backtest/chat-sessions").json()
    resp = client.put(
        f"/api/backtest/chat-sessions/{created['id']}",
        json={
            "title": "Renamed",
            "config": _config_payload(),
            "messages": [{"role": "user", "text": "hi"}],
            "input": "draft text",
            "window_start": None,
            "window_end": None,
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Renamed"
    assert body["input"] == "draft text"


def test_delete_chat_session(client):
    created = client.post("/api/backtest/chat-sessions").json()
    resp = client.delete(f"/api/backtest/chat-sessions/{created['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/backtest/chat-sessions/{created['id']}")
    assert resp.status_code == 404
