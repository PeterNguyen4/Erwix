import logging
from typing import Annotated
from datetime import UTC, datetime, timedelta

import jwt
from jwt import PyJWKClient
from fastapi import Cookie, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from .config import get_settings

password_hash = PasswordHash.recommended()
settings = get_settings()

logger = logging.getLogger("entro.auth")
bearer = HTTPBearer()

COOKIE_NAME = "token"

_jwks_client: PyJWKClient | None = None


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


def verify_access_token(token: str) -> str | None:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key.get_secret_value(),
            algorithms=[settings.algorithm],
            options={"require": ["exp", "sub"]}
        )
    except jwt.InvalidTokenError:
        return None
    else:
        return payload.get("sub")


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        from app.config import get_settings
        settings = get_settings()
        _jwks_client = PyJWKClient(settings.clerk_jwks_url, cache_keys=True)
    return _jwks_client


def _decode_token(token: str) -> str:
    client = _get_jwks_client()
    signing_key = client.get_signing_key_from_jwt(token)
    payload = jwt.decode(
        token,
        signing_key.key,
        algorithms=["RS256"],
        options={"verify_aud": False},
        leeway=60,
    )
    user_id: str = payload.get("sub", "")
    if not user_id:
        raise ValueError("Missing sub claim")
    return user_id


async def get_current_user_id(
    token: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None,
) -> int:
    user_id = verify_access_token(token) if token else None
    if user_id is not None:
        try:
            return int(user_id)
        except (TypeError, ValueError):
            pass
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )


async def require_auth(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer)],
) -> str:
    try:
        return _decode_token(credentials.credentials)
    except Exception as exc:
        logger.warning("Auth failed: %s: %s", type(exc).__name__, exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


async def require_ws_auth(token: str = Query(...)) -> str:
    """WebSocket auth: token passed as ?token= query param (browsers can't set WS headers)."""
    try:
        return _decode_token(token)
    except Exception as exc:
        logger.warning("WS auth failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
