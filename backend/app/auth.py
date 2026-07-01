import logging
from typing import Annotated

import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

logger = logging.getLogger("entro.auth")
bearer = HTTPBearer()

_jwks_client: PyJWKClient | None = None


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
