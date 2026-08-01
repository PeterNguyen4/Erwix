import logging

from fastapi import Depends, HTTPException, Request

from app.auth import get_current_user_id
from app.config import get_settings
from app.services.rate_limiter import get_rate_limiter

logger = logging.getLogger("entro.rate_limiter")


def rate_limit(route_class: str, limit: int, window_ms: int, fail_open: bool | None = None):
    """Sliding window rate limiting per-user + per-route-class."""

    async def dependency(request: Request, user_id: int = Depends(get_current_user_id)) -> None:
        settings = get_settings()
        open_on_error = settings.rate_limit_fail_open if fail_open is None else fail_open
        key = f"ratelimit:{user_id}:{route_class}"
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

    return dependency
