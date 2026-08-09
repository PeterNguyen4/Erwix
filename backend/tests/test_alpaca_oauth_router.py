from unittest.mock import AsyncMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from cryptography.fernet import Fernet
from pydantic import SecretStr

from app.auth import create_oauth_state
from app.models import AlpacaAccount
from app.services import token_crypto
from tests.conftest import TEST_USER_ID


@pytest.fixture()
def oauth_configured(monkeypatch):
    """Alpaca OAuth + token encryption aren't configured in the local .env (paper-only
    per-user linking is mid-rollout), so stub the settings the router/token_crypto need."""
    from app.routers import alpaca_oauth

    monkeypatch.setattr(alpaca_oauth.settings, "alpaca_oauth_client_id", "test-client-id")
    monkeypatch.setattr(alpaca_oauth.settings, "alpaca_oauth_client_secret", "test-client-secret")
    monkeypatch.setattr(alpaca_oauth.settings, "alpaca_oauth_redirect_uri", "https://entro.test/callback")
    monkeypatch.setattr(alpaca_oauth.settings, "frontend_base_url", "https://entro.test")
    monkeypatch.setattr(alpaca_oauth.settings, "token_encryption_key", SecretStr(Fernet.generate_key().decode()))
    token_crypto._fernet.cache_clear()
    yield
    token_crypto._fernet.cache_clear()


def test_connect_returns_authorize_url(client, oauth_configured):
    resp = client.get("/api/alpaca/connect?env=paper")
    assert resp.status_code == 200
    url = resp.json()["url"]
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    assert parsed.scheme == "https"
    assert params["client_id"] == ["test-client-id"]
    assert params["env"] == ["paper"]
    assert "state" in params


def test_connect_rejects_invalid_env(client, oauth_configured):
    resp = client.get("/api/alpaca/connect?env=nope")
    assert resp.status_code == 422


def test_connect_503_when_oauth_not_configured(client):
    resp = client.get("/api/alpaca/connect?env=paper")
    assert resp.status_code == 503


def test_status_not_connected_when_no_account(client):
    resp = client.get("/api/alpaca/status")
    assert resp.status_code == 200
    assert resp.json() == {"connected": False, "env": None}


@pytest.mark.asyncio
async def test_status_connected_reports_env(client, db_session, oauth_configured):
    db_session.add(
        AlpacaAccount(user_id=TEST_USER_ID, access_token=token_crypto.encrypt_token("secret"), env="paper")
    )
    await db_session.commit()

    resp = client.get("/api/alpaca/status")
    assert resp.status_code == 200
    assert resp.json() == {"connected": True, "env": "paper"}


@pytest.mark.asyncio
async def test_disconnect_removes_existing_account(client, db_session, oauth_configured):
    db_session.add(
        AlpacaAccount(user_id=TEST_USER_ID, access_token=token_crypto.encrypt_token("secret"), env="paper")
    )
    await db_session.commit()

    resp = client.post("/api/alpaca/disconnect")
    assert resp.status_code == 200
    assert resp.json() == {"success": True}

    status_resp = client.get("/api/alpaca/status")
    assert status_resp.json()["connected"] is False


def test_disconnect_is_a_noop_when_nothing_connected(client):
    resp = client.post("/api/alpaca/disconnect")
    assert resp.status_code == 200
    assert resp.json() == {"success": True}


def _fake_token_response(access_token: str = "alpaca-access-token") -> httpx.Response:
    return httpx.Response(200, json={"access_token": access_token}, request=httpx.Request("POST", "https://x"))


def test_callback_creates_account_on_success(client, db_session, oauth_configured):
    state = create_oauth_state(TEST_USER_ID, "paper")

    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_fake_token_response())):
        resp = client.get(
            f"/api/alpaca/callback?code=abc123&state={state}", follow_redirects=False
        )

    assert resp.status_code in (302, 307)
    assert "alpaca=connected" in resp.headers["location"]


@pytest.mark.asyncio
async def test_callback_updates_existing_account(client, db_session, oauth_configured):
    db_session.add(
        AlpacaAccount(user_id=TEST_USER_ID, access_token=token_crypto.encrypt_token("old"), env="paper")
    )
    await db_session.commit()

    state = create_oauth_state(TEST_USER_ID, "live")
    with patch("httpx.AsyncClient.post", new=AsyncMock(return_value=_fake_token_response("new-token"))):
        client.get(f"/api/alpaca/callback?code=abc123&state={state}", follow_redirects=False)

    status_resp = client.get("/api/alpaca/status")
    assert status_resp.json() == {"connected": True, "env": "live"}


def test_callback_redirects_with_error_on_invalid_state(client, oauth_configured):
    resp = client.get(
        "/api/alpaca/callback?code=abc123&state=not-a-valid-token", follow_redirects=False
    )
    assert resp.status_code in (302, 307)
    assert "alpaca=error" in resp.headers["location"]


def test_callback_redirects_with_error_on_token_exchange_failure(client, oauth_configured):
    state = create_oauth_state(TEST_USER_ID, "paper")
    failing_response = httpx.Response(400, json={}, request=httpx.Request("POST", "https://x"))

    async def _raise(*args, **kwargs):
        raise httpx.HTTPStatusError("bad request", request=failing_response.request, response=failing_response)

    with patch("httpx.AsyncClient.post", new=_raise):
        resp = client.get(
            f"/api/alpaca/callback?code=abc123&state={state}", follow_redirects=False
        )

    assert resp.status_code in (302, 307)
    assert "alpaca=error" in resp.headers["location"]


def test_callback_redirects_with_error_when_rate_limited(client, oauth_configured, monkeypatch):
    from app.routers import alpaca_oauth

    async def _rate_limited(*args, **kwargs):
        return "rate limit exceeded"

    monkeypatch.setattr(alpaca_oauth, "check_ip_rate_limit", _rate_limited)
    state = create_oauth_state(TEST_USER_ID, "paper")

    resp = client.get(f"/api/alpaca/callback?code=abc123&state={state}", follow_redirects=False)
    assert resp.status_code in (302, 307)
    assert "alpaca=error" in resp.headers["location"]
