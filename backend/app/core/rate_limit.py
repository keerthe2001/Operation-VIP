"""Fixed-window rate limiting backed by Redis."""

import logging
from collections.abc import Awaitable, Callable

from fastapi import Request
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.core.errors import RateLimitedError

logger = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(
    scope: str, limit_getter: Callable[[Request], int], window_seconds: int = 60
) -> Callable[[Request], Awaitable[None]]:
    """FastAPI dependency limiting requests per client IP for a named scope.

    Fails open (logs a warning) if Redis is unavailable, so an outage of the
    cache does not lock every user out.
    """

    async def dependency(request: Request) -> None:
        redis: Redis = request.app.state.redis
        key = f"ratelimit:{scope}:{client_ip(request)}"
        try:
            count = await redis.incr(key)
            if count == 1:
                await redis.expire(key, window_seconds)
        except RedisError:
            logger.warning("Rate limiter unavailable; allowing request for %s", scope)
            return
        if count > limit_getter(request):
            raise RateLimitedError()

    return dependency
