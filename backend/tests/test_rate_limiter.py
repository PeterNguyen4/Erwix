import asyncio
import uuid

import pytest
import pytest_asyncio

from app.services.rate_limiter import RateLimiter

REDIS_URL = "redis://localhost:6379/15"  # dedicated DB so tests never touch real app data


@pytest_asyncio.fixture()
async def limiter():
    rl = RateLimiter(REDIS_URL)
    yield rl
    await rl.aclose()


def _key() -> str:
    return f"test:ratelimit:{uuid.uuid4().hex}"


@pytest.mark.asyncio
async def test_allows_requests_under_the_limit(limiter):
    key = _key()
    result = await limiter.check(key, limit=3, window_ms=5000)
    assert result.allowed is True
    assert result.remaining == 2


@pytest.mark.asyncio
async def test_remaining_decrements_each_call(limiter):
    key = _key()
    first = await limiter.check(key, limit=3, window_ms=5000)
    second = await limiter.check(key, limit=3, window_ms=5000)
    third = await limiter.check(key, limit=3, window_ms=5000)
    assert [first.remaining, second.remaining, third.remaining] == [2, 1, 0]


@pytest.mark.asyncio
async def test_blocks_once_limit_is_reached(limiter):
    key = _key()
    for _ in range(3):
        await limiter.check(key, limit=3, window_ms=5000)

    blocked = await limiter.check(key, limit=3, window_ms=5000)
    assert blocked.allowed is False
    assert blocked.remaining == 0
    assert blocked.retry_after_ms > 0


@pytest.mark.asyncio
async def test_retry_after_is_bounded_by_window(limiter):
    key = _key()
    window_ms = 2000
    for _ in range(2):
        await limiter.check(key, limit=2, window_ms=window_ms)

    blocked = await limiter.check(key, limit=2, window_ms=window_ms)
    assert 0 < blocked.retry_after_ms <= window_ms


@pytest.mark.asyncio
async def test_sliding_window_admits_new_requests_once_it_elapses(limiter):
    key = _key()
    window_ms = 300
    await limiter.check(key, limit=1, window_ms=window_ms)
    blocked = await limiter.check(key, limit=1, window_ms=window_ms)
    assert blocked.allowed is False

    await asyncio.sleep((window_ms + 100) / 1000)

    recovered = await limiter.check(key, limit=1, window_ms=window_ms)
    assert recovered.allowed is True


@pytest.mark.asyncio
async def test_distinct_keys_are_independent(limiter):
    key_a, key_b = _key(), _key()
    for _ in range(3):
        await limiter.check(key_a, limit=3, window_ms=5000)

    blocked_a = await limiter.check(key_a, limit=3, window_ms=5000)
    allowed_b = await limiter.check(key_b, limit=3, window_ms=5000)

    assert blocked_a.allowed is False
    assert allowed_b.allowed is True


@pytest.mark.asyncio
async def test_result_reports_the_configured_limit(limiter):
    key = _key()
    result = await limiter.check(key, limit=7, window_ms=5000)
    assert result.limit == 7


@pytest.mark.asyncio
async def test_recovers_from_flushed_script_cache(limiter):
    # Simulates a Redis-side SCRIPT FLUSH (e.g. after a Redis restart/failover):
    # the client-side registered SHA no longer exists server-side until re-registered.
    key = _key()
    await limiter._client.script_flush()

    result = await limiter.check(key, limit=3, window_ms=5000)
    assert result.allowed is True
    assert result.remaining == 2


@pytest.mark.asyncio
async def test_concurrent_checks_do_not_overrun_the_limit(limiter):
    # The Lua script's atomicity is the whole point — concurrent callers racing
    # for the last slot must never let more than `limit` through.
    key = _key()
    results = await asyncio.gather(*[limiter.check(key, limit=5, window_ms=5000) for _ in range(20)])
    assert sum(1 for r in results if r.allowed) == 5
