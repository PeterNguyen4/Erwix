import hashlib
import logging
import secrets
from typing import Annotated
from datetime import UTC, datetime, timedelta

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from pwdlib import PasswordHash
from sqlalchemy.ext.asyncio import AsyncSession

from .config import get_settings
from .db import get_db
from .models import User

password_hash = PasswordHash.recommended()
settings = get_settings()

logger = logging.getLogger("entro.auth")

COOKIE_NAME = "token"
REFRESH_COOKIE_NAME = "refresh_token"
REFRESH_COOKIE_PATH = "/api/users"


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return password_hash.verify(plain_password, hashed_password)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    raw_data = data.copy()
    if expires_delta:
        expire = datetime.now(UTC) + expires_delta
    else:
        expire = datetime.now(UTC) + timedelta(
            minutes=settings.access_token_expire_minutes,
        )
    raw_data.update({"exp": expire})
    encoded_jwt = jwt.encode(
        raw_data,
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm
    )
    return encoded_jwt


def verify_access_token(token: str) -> tuple[str, int] | None:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.algorithm],
            options={"require": ["exp", "sub", "tv"]}
        )
    except jwt.InvalidTokenError:
        return None
    else:
        return payload.get("sub"), payload.get("tv")


def generate_refresh_token() -> tuple[str, str, datetime]:
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    expires_at = datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days)
    return raw_token, token_hash, expires_at


def hash_refresh_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def create_oauth_state(user_id: int, env: str) -> str:
    """Token issued to connect to Alpaca"""
    expire = datetime.now(UTC) + timedelta(minutes=10)
    return jwt.encode(
        {"sub": str(user_id), "env": env, "purpose": "alpaca_oauth", "exp": expire},
        settings.secret_key.get_secret_value(),
        algorithm=settings.algorithm,
    )


def verify_oauth_state(state: str) -> tuple[int, str] | None:
    try:
        payload = jwt.decode(
            state,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.algorithm],
            options={"require": ["exp", "sub", "env"]},
        )
    except jwt.InvalidTokenError:
        return None
    if payload.get("purpose") != "alpaca_oauth":
        return None
    try:
        return int(payload["sub"]), payload["env"]
    except (TypeError, ValueError, KeyError):
        return None


async def get_current_user_id(
    token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
    db: AsyncSession = Depends(get_db),
) -> int:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )
    decoded = verify_access_token(token) if token else None
    if decoded is None:
        raise unauthorized
    raw_user_id, token_version = decoded
    try:
        user_id = int(raw_user_id)
    except (TypeError, ValueError):
        raise unauthorized from None

    user = await db.get(User, user_id)
    if user is None or user.token_version != token_version:
        raise unauthorized
    return user_id
