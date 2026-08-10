import logging
import time
import uuid
from dataclasses import dataclass

import redis.asyncio as redis
from redis.exceptions import NoScriptError

from app.config import get_settings

logger = logging.getLogger("erwix.rate_limiter")

# Sliding-window Log using Lua scripts to prevent race conditions (atomic)
_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

local window_start = now_ms - window_ms

redis.call("ZREMRANGEBYSCORE", key, "-inf", window_start)
local count = redis.call("ZCARD", key)

if count < limit then
    redis.call("ZADD", key, now_ms, member)
    redis.call("PEXPIRE", key, window_ms)
    local remaining = limit - count - 1
    return {1, remaining, 0}
end

local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local retry_after_ms = window_ms
if oldest[2] ~= nil then
    retry_after_ms = tonumber(oldest[2]) + window_ms - now_ms
end
return {0, 0, retry_after_ms}
"""


@dataclass(frozen=True)
class RateLimitResult:
    allowed: bool
    remaining: int
    retry_after_ms: int
    limit: int


class RateLimiter:
    def __init__(self, redis_url: str) -> None:
        self._client = redis.from_url(redis_url, decode_responses=True)
        self._script = self._client.register_script(_SLIDING_WINDOW_SCRIPT)

    async def check(self, key: str, limit: int, window_ms: int) -> RateLimitResult:
        now_ms = time.time_ns() // 1_000_000
        member = f"{now_ms}-{uuid.uuid4().hex}"
        try:
            allowed, remaining, retry_after_ms = await self._script(
                keys=[key], args=[now_ms, window_ms, limit, member]
            )
        except NoScriptError:
            # Handle cache flush
            self._script = self._client.register_script(_SLIDING_WINDOW_SCRIPT)
            allowed, remaining, retry_after_ms = await self._script(
                keys=[key], args=[now_ms, window_ms, limit, member]
            )
        return RateLimitResult(
            allowed=bool(allowed),
            remaining=int(remaining),
            retry_after_ms=int(retry_after_ms),
            limit=limit,
        )

    async def aclose(self) -> None:
        await self._client.aclose()


_limiter: RateLimiter | None = None


def get_rate_limiter() -> RateLimiter:
    global _limiter
    if _limiter is None:
        _limiter = RateLimiter(get_settings().redis_url)
    return _limiter


async def close_rate_limiter() -> None:
    global _limiter
    if _limiter is not None:
        await _limiter.aclose()
        _limiter = None
