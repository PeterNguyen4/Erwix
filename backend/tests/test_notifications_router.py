from datetime import datetime, timedelta, timezone

import pytest

from app.models import AlpacaAccount, NotificationDismissal, StrategyNote
from tests.conftest import TEST_USER_ID


def test_default_notifications_include_alpaca_and_strategy_nudges(client):
    resp = client.get("/api/notifications")
    assert resp.status_code == 200
    body = resp.json()
    types = {item["type"] for item in body["items"]}
    assert types == {"alpaca_disconnected", "strategy_missing"}
    assert body["unseen_count"] == 2


@pytest.mark.asyncio
async def test_alpaca_nudge_disappears_once_connected(client, db_session):
    # notifications only checks the account row exists, doesn't decrypt the token
    db_session.add(AlpacaAccount(user_id=TEST_USER_ID, access_token="fake-encrypted-token", env="paper"))
    await db_session.commit()

    resp = client.get("/api/notifications")
    types = {item["type"] for item in resp.json()["items"]}
    assert "alpaca_disconnected" not in types


@pytest.mark.asyncio
async def test_strategy_nudge_disappears_once_strategy_exists(client, db_session):
    db_session.add(StrategyNote(user_id=TEST_USER_ID, name="My Strategy"))
    await db_session.commit()

    resp = client.get("/api/notifications")
    types = {item["type"] for item in resp.json()["items"]}
    assert "strategy_missing" not in types


def test_mark_read_clears_unseen_flag(client):
    listing = client.get("/api/notifications").json()
    key = listing["items"][0]["id"]

    resp = client.post("/api/notifications/read", json={"key": key})
    assert resp.status_code == 200
    item = next(i for i in resp.json()["items"] if i["id"] == key)
    assert item["unseen"] is False


def test_dismiss_removes_notification_from_list(client):
    listing = client.get("/api/notifications").json()
    key = listing["items"][0]["id"]

    resp = client.post("/api/notifications/dismiss", json={"key": key})
    assert resp.status_code == 200
    assert key not in {i["id"] for i in resp.json()["items"]}


@pytest.mark.asyncio
async def test_dismissed_persistent_nudge_resurfaces_after_expiry(client, db_session):
    db_session.add(
        NotificationDismissal(
            user_id=TEST_USER_ID,
            notification_key="alpaca_disconnected",
            dismissed_at=datetime.now(timezone.utc) - timedelta(days=3),
            read_at=datetime.now(timezone.utc) - timedelta(days=3),
        )
    )
    await db_session.commit()

    resp = client.get("/api/notifications")
    types = {item["type"] for item in resp.json()["items"]}
    assert "alpaca_disconnected" in types


@pytest.mark.asyncio
async def test_dismissed_persistent_nudge_stays_hidden_within_expiry_window(client, db_session):
    db_session.add(
        NotificationDismissal(
            user_id=TEST_USER_ID,
            notification_key="alpaca_disconnected",
            dismissed_at=datetime.now(timezone.utc) - timedelta(hours=1),
            read_at=datetime.now(timezone.utc) - timedelta(hours=1),
        )
    )
    await db_session.commit()

    resp = client.get("/api/notifications")
    types = {item["type"] for item in resp.json()["items"]}
    assert "alpaca_disconnected" not in types
