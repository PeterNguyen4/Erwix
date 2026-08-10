import logging

from fastapi import Depends, HTTPException, Request

from app.auth import get_current_user_id
from app.config import get_settings
from app.services.rate_limiter import get_rate_limiter

logger = logging.getLogger("entro.rate_limiter")


async def _check(
    request: Request, key: str, limit: int, window_ms: int, fail_open: bool | None
) -> None:
    settings = get_settings()
    open_on_error = settings.rate_limit_fail_open if fail_open is None else fail_open
    try:
        result = await get_rate_limiter().check(key, limit=limit, window_ms=window_ms)
    except Exception:
        logger.exception("rate limiter unavailable for %s", key)
        if open_on_error:
            return
        raise HTTPException(status_code=503, detail="Rate limiter unavailable") from None

    request.state.rate_limit_remaining = result.remaining
    request.state.rate_limit_limit = result.limit

    if not result.allowed:
        retry_after_s = max(1, (result.retry_after_ms + 999) // 1000)
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded",
            headers={"Retry-After": str(retry_after_s)},
        )


def rate_limit(route_class: str, limit: int, window_ms: int, fail_open: bool | None = None):
    """Per-user + per-route-class."""

    async def dependency(request: Request, user_id: int = Depends(get_current_user_id)) -> None:
        key = f"ratelimit:{user_id}:{route_class}"
        await _check(request, key, limit, window_ms, fail_open)

    return dependency


def rate_limit_by_ip(route_class: str, limit: int, window_ms: int, fail_open: bool | None = None):
    """Per-client-IP + per-route-class for auth flow"""

    async def dependency(request: Request) -> None:
        client_ip = request.client.host if request.client else "unknown"
        key = f"ratelimit:ip:{client_ip}:{route_class}"
        await _check(request, key, limit, window_ms, fail_open)

    return dependency


async def check_ip_rate_limit(
    client_ip: str,
    route_class: str,
    limit: int,
    window_ms: int,
    fail_open: bool | None = None,
) -> str | None:
    """Per-client-IP + per-route-class that redirects instead of emitting HTTP error."""
    settings = get_settings()
    open_on_error = settings.rate_limit_fail_open if fail_open is None else fail_open
    key = f"ratelimit:ip:{client_ip}:{route_class}"
    try:
        result = await get_rate_limiter().check(key, limit=limit, window_ms=window_ms)
    except Exception:
        logger.exception("rate limiter unavailable for %s", key)
        return None if open_on_error else "rate limiter unavailable"

    return None if result.allowed else "rate limit exceeded"


async def check_ws_rate_limit(
    user_id: int,
    route_class: str,
    limit: int,
    window_ms: int,
    fail_open: bool | None = None,
) -> str | None:
    """Per-user + per-route-class for WebSocket routes to gracefully close."""
    settings = get_settings()
    open_on_error = settings.rate_limit_fail_open if fail_open is None else fail_open
    key = f"ratelimit:{user_id}:{route_class}"
    try:
        result = await get_rate_limiter().check(key, limit=limit, window_ms=window_ms)
    except Exception:
        logger.exception("rate limiter unavailable for %s", key)
        return None if open_on_error else "rate limiter unavailable"

    return None if result.allowed else "rate limit exceeded"
