from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException

from app import auth
from app.config import get_settings


def test_hash_password_survives_round_trip():
    hashed = auth.hash_password("this is my test password 123")
    assert hashed != "this is my test password 123"
    assert auth.verify_password("this is my test password 123", hashed)


def test_verify_password_rejects_wrong_password():
    hashed = auth.hash_password("this is my test password 123")
    assert not auth.verify_password("wrong password", hashed)


def test_access_token_survives_round_trip():
    token = auth.create_access_token({"sub": "50", "tv": 3})
    assert auth.verify_access_token(token) == ("50", 3)


def test_access_token_rejects_invalid_signature():
    token = auth.create_access_token({"sub": "50", "tv": 3})
    tampered = token[:-5] + ("0" if token[-5] != "0" else "1") + token[-3:]
    assert auth.verify_access_token(tampered) is None


def test_access_token_rejects_expired_token():
    token = auth.create_access_token({"sub": "50", "tv": 3}, expires_delta=timedelta(seconds=-1))
    assert auth.verify_access_token(token) is None


def test_access_token_rejects_missing_required_claims():
    settings = get_settings()
    token = jwt.encode(
        {"sub": "50", "exp": datetime.now(UTC) + timedelta(minutes=5)},
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm,
    )
    assert auth.verify_access_token(token) is None


def test_verify_access_token_rejects_garbage_string():
    assert auth.verify_access_token("not.a.jwt") is None


def test_generate_refresh_token_hash_matches_hash_refresh_token():
    raw, token_hash, expires_at = auth.generate_refresh_token()
    assert auth.hash_refresh_token(raw) == token_hash
    assert expires_at > datetime.now(UTC)


def test_generate_refresh_token_produces_unique_values():
    raw1, hash1, _ = auth.generate_refresh_token()
    raw2, hash2, _ = auth.generate_refresh_token()
    assert raw1 != raw2
    assert hash1 != hash2


def test_generate_password_reset_token_hash_matches():
    raw, token_hash, expires_at = auth.generate_password_reset_token()
    assert auth.hash_password_reset_token(raw) == token_hash
    assert expires_at > datetime.now(UTC)


def test_oauth_state_survives_round_trip():
    state = auth.create_oauth_state(user_id=7, env="paper")
    assert auth.verify_oauth_state(state) == (7, "paper")


def test_oauth_state_rejects_expired_token():
    settings = get_settings()
    expired = jwt.encode(
        {
            "sub": "7",
            "env": "paper",
            "purpose": "alpaca_oauth",
            "exp": datetime.now(UTC) - timedelta(minutes=1),
        },
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm,
    )
    assert auth.verify_oauth_state(expired) is None


def test_oauth_state_rejects_wrong_purpose():
    settings = get_settings()
    wrong_purpose = jwt.encode(
        {
            "sub": "7",
            "env": "paper",
            "purpose": "something_else",
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm,
    )
    assert auth.verify_oauth_state(wrong_purpose) is None


def test_oauth_state_rejects_access_token_reused_as_state():
    # an ordinary access token has no "env"/"purpose" claims and must not verify as oauth state
    access_token = auth.create_access_token({"sub": "7", "tv": 1})
    assert auth.verify_oauth_state(access_token) is None


class _MockUser:
    def __init__(self, user_id: int, token_version: int, role: str = "user"):
        self.id = user_id
        self.token_version = token_version
        self.role = role


@pytest.mark.asyncio
async def test_get_current_user_id_returns_id_for_valid_token():
    user = _MockUser(user_id=50, token_version=3)
    db = AsyncMock()
    db.get = AsyncMock(return_value=user)
    token = auth.create_access_token({"sub": "50", "tv": 3})

    assert await auth.get_current_user_id(token=token, db=db) == 50


@pytest.mark.asyncio
async def test_get_current_user_id_rejects_missing_cookie():
    db = AsyncMock()
    with pytest.raises(HTTPException) as exc_info:
        await auth.get_current_user_id(token=None, db=db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_id_rejects_stale_token_version():
    # token was issued before a password change / logout-everywhere bumped token_version
    user = _MockUser(user_id=50, token_version=5)
    db = AsyncMock()
    db.get = AsyncMock(return_value=user)
    token = auth.create_access_token({"sub": "50", "tv": 3})

    with pytest.raises(HTTPException) as exc_info:
        await auth.get_current_user_id(token=token, db=db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_get_current_user_id_rejects_deleted_user():
    db = AsyncMock()
    db.get = AsyncMock(return_value=None)
    token = auth.create_access_token({"sub": "50", "tv": 3})

    with pytest.raises(HTTPException) as exc_info:
        await auth.get_current_user_id(token=token, db=db)
    assert exc_info.value.status_code == 401


@pytest.mark.asyncio
async def test_require_admin_allows_admin_role():
    user = _MockUser(user_id=1, token_version=1, role="admin")
    db = AsyncMock()
    db.get = AsyncMock(return_value=user)

    assert await auth.require_admin(user_id=1, db=db) == 1


@pytest.mark.asyncio
async def test_require_admin_rejects_non_admin_role():
    user = _MockUser(user_id=1, token_version=1, role="user")
    db = AsyncMock()
    db.get = AsyncMock(return_value=user)

    with pytest.raises(HTTPException) as exc_info:
        await auth.require_admin(user_id=1, db=db)
    assert exc_info.value.status_code == 403
