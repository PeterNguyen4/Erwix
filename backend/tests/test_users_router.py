from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.auth import generate_password_reset_token, hash_password
from app.models import PasswordResetToken, RefreshToken, User

REGISTER_PAYLOAD = {"username": "newtrader", "email": "newtrader@example.com", "password": "correcthorse123"}


def test_register_creates_user(client):
    resp = client.post("/api/users/register", json=REGISTER_PAYLOAD)
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "newtrader"
    assert body["email"] == "newtrader@example.com"
    assert body["role"] == "user"
    assert "password" not in body


def test_register_rejects_duplicate_username_case_insensitive(client):
    client.post("/api/users/register", json=REGISTER_PAYLOAD)
    resp = client.post(
        "/api/users/register",
        json={**REGISTER_PAYLOAD, "username": "NEWTRADER", "email": "other@example.com"},
    )
    assert resp.status_code == 400
    assert "Username" in resp.json()["detail"]


def test_register_rejects_duplicate_email_case_insensitive(client):
    client.post("/api/users/register", json=REGISTER_PAYLOAD)
    resp = client.post(
        "/api/users/register",
        json={**REGISTER_PAYLOAD, "username": "othername", "email": "NEWTRADER@example.com"},
    )
    assert resp.status_code == 400
    assert "Email" in resp.json()["detail"]


async def _create_login_ready_user(db_session, email: str, password: str) -> User:
    user = User(username=email.split("@")[0], email=email, hashed_password=hash_password(password))
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.mark.asyncio
async def test_login_success_sets_cookies_and_returns_user(client, db_session):
    await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")

    resp = client.post(
        "/api/users/token", data={"username": "trader@example.com", "password": "correcthorse123"}
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "trader@example.com"
    assert "token" in resp.cookies
    assert "refresh_token" in resp.cookies


@pytest.mark.asyncio
async def test_login_wrong_password_rejected(client, db_session):
    await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")

    resp = client.post("/api/users/token", data={"username": "trader@example.com", "password": "wrong"})
    assert resp.status_code == 401


def test_login_unknown_email_rejected(client):
    resp = client.post("/api/users/token", data={"username": "ghost@example.com", "password": "whatever1"})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_issues_new_tokens_and_revokes_old_one(client, db_session):
    await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")
    login = client.post(
        "/api/users/token", data={"username": "trader@example.com", "password": "correcthorse123"}
    )
    old_refresh_cookie = login.cookies["refresh_token"]

    resp = client.post("/api/users/refresh", cookies={"refresh_token": old_refresh_cookie})
    assert resp.status_code == 200
    assert resp.cookies["refresh_token"] != old_refresh_cookie

    # the old refresh token must now be revoked, so reusing it fails
    reuse = client.post("/api/users/refresh", cookies={"refresh_token": old_refresh_cookie})
    assert reuse.status_code == 401


def test_refresh_without_cookie_rejected(client):
    resp = client.post("/api/users/refresh")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_refresh_with_expired_token_rejected(client, db_session):
    from app.auth import hash_refresh_token

    user = await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")
    raw_token = "expired-raw-refresh-token"
    db_session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_refresh_token(raw_token),
            expires_at=datetime.now(UTC) - timedelta(days=1),
        )
    )
    await db_session.commit()

    resp = client.post("/api/users/refresh", cookies={"refresh_token": raw_token})
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_logout_revokes_refresh_token_and_clears_cookies(client, db_session):
    await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")
    login = client.post(
        "/api/users/token", data={"username": "trader@example.com", "password": "correcthorse123"}
    )
    refresh_cookie = login.cookies["refresh_token"]

    resp = client.post("/api/users/logout", cookies={"refresh_token": refresh_cookie})
    assert resp.status_code == 200

    reuse = client.post("/api/users/refresh", cookies={"refresh_token": refresh_cookie})
    assert reuse.status_code == 401


@pytest.mark.asyncio
async def test_logout_all_bumps_token_version_and_revokes_refresh_tokens(client, db_session):
    from tests.conftest import TEST_USER_ID

    db_session.add(
        RefreshToken(
            user_id=TEST_USER_ID,
            token_hash="a" * 64,
            expires_at=datetime.now(UTC) + timedelta(days=1),
        )
    )
    await db_session.commit()

    resp = client.post("/api/users/logout-all")
    assert resp.status_code == 200

    user = await db_session.get(User, TEST_USER_ID)
    await db_session.refresh(user)
    assert user.token_version == 1

    stored = (
        await db_session.execute(select(RefreshToken).where(RefreshToken.user_id == TEST_USER_ID))
    ).scalars().first()
    assert stored.revoked_at is not None


@pytest.mark.asyncio
async def test_forgot_password_always_returns_success_for_unknown_email(client):
    with patch("app.routers.users.send_password_reset_email", new_callable=AsyncMock) as mock_send:
        resp = client.post("/api/users/forgot-password", json={"email": "ghost@example.com"})
    assert resp.status_code == 200
    assert resp.json() == {"success": True}
    mock_send.assert_not_called()


@pytest.mark.asyncio
async def test_forgot_password_sends_email_for_known_user(client, db_session):
    await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")

    with patch("app.routers.users.send_password_reset_email", new_callable=AsyncMock) as mock_send:
        resp = client.post("/api/users/forgot-password", json={"email": "trader@example.com"})
    assert resp.status_code == 200
    mock_send.assert_called_once()


@pytest.mark.asyncio
async def test_reset_password_with_valid_token_changes_password(client, db_session):
    user = await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")
    raw_token, token_hash, expires_at = generate_password_reset_token()
    db_session.add(PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at))
    await db_session.commit()

    resp = client.post(
        "/api/users/reset-password", json={"token": raw_token, "new_password": "newpassword123"}
    )
    assert resp.status_code == 200

    login = client.post(
        "/api/users/token", data={"username": "trader@example.com", "password": "newpassword123"}
    )
    assert login.status_code == 200


@pytest.mark.asyncio
async def test_reset_password_rejects_already_used_token(client, db_session):
    user = await _create_login_ready_user(db_session, "trader@example.com", "correcthorse123")
    raw_token, token_hash, expires_at = generate_password_reset_token()
    db_session.add(
        PasswordResetToken(user_id=user.id, token_hash=token_hash, expires_at=expires_at, used_at=datetime.now(UTC))
    )
    await db_session.commit()

    resp = client.post(
        "/api/users/reset-password", json={"token": raw_token, "new_password": "newpassword123"}
    )
    assert resp.status_code == 400


def test_reset_password_rejects_unknown_token(client):
    resp = client.post(
        "/api/users/reset-password", json={"token": "not-a-real-token", "new_password": "newpassword123"}
    )
    assert resp.status_code == 400


def test_get_me_returns_current_user(client):
    resp = client.get("/api/users/me")
    assert resp.status_code == 200
    assert resp.json()["id"] == 1


def test_update_me_changes_username(client):
    resp = client.patch("/api/users/me", json={"username": "renamed"})
    assert resp.status_code == 200
    assert resp.json()["username"] == "renamed"


@pytest.mark.asyncio
async def test_update_me_rejects_username_already_taken(client, db_session):
    db_session.add(User(username="taken", email="taken@example.com", hashed_password="x"))
    await db_session.commit()

    resp = client.patch("/api/users/me", json={"username": "taken"})
    assert resp.status_code == 400


def test_get_preferences_creates_default_on_first_access(client):
    resp = client.get("/api/users/preferences")
    assert resp.status_code == 200


def test_update_preferences_persists_last_symbol(client):
    resp = client.patch("/api/users/preferences", json={"last_symbol": "aapl"})
    assert resp.status_code == 200
    assert resp.json()["last_symbol"] == "AAPL"


def test_admin_routes_reject_non_admin_user(client):
    resp = client.get("/api/users/admin/users")
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_admin_can_list_and_update_roles(client, db_session):
    from tests.conftest import TEST_USER_ID

    admin = await db_session.get(User, TEST_USER_ID)
    admin.role = "admin"
    other = User(username="promoteme", email="promoteme@example.com", hashed_password="x")
    db_session.add(other)
    await db_session.commit()
    await db_session.refresh(other)

    listing = client.get("/api/users/admin/users")
    assert listing.status_code == 200
    assert any(u["username"] == "promoteme" for u in listing.json())

    promote = client.patch(f"/api/users/admin/users/{other.id}/role", json={"role": "admin"})
    assert promote.status_code == 200
    assert promote.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_admin_cannot_remove_own_admin_access(client, db_session):
    from tests.conftest import TEST_USER_ID

    admin = await db_session.get(User, TEST_USER_ID)
    admin.role = "admin"
    await db_session.commit()

    resp = client.patch(f"/api/users/admin/users/{TEST_USER_ID}/role", json={"role": "user"})
    assert resp.status_code == 400
