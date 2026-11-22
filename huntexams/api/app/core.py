"""Database access, password hashing, session tokens, errors and rate limiting."""

import hashlib
import secrets
import time
from collections import defaultdict
from collections.abc import AsyncIterator, Awaitable, Callable

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError
from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

# ---------------------------------------------------------------- database


class Database:
    def __init__(self, url: str) -> None:
        self.engine: AsyncEngine = create_async_engine(url, pool_pre_ping=True)
        self.sessionmaker = async_sessionmaker(self.engine, expire_on_commit=False)

    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.sessionmaker() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()


# ---------------------------------------------------------------- passwords and tokens

_hasher = PasswordHasher()
_DUMMY_HASH = _hasher.hash("timing-equalizer-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    """Constant-ish time check: a missing user still costs one hash verification."""
    try:
        ok = _hasher.verify(password_hash or _DUMMY_HASH, password)
        return ok and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------- errors


def api_error(code: int, message: str, kind: str = "error") -> HTTPException:
    return HTTPException(status_code=code, detail={"code": kind, "message": message})


def not_found(what: str = "Not found") -> HTTPException:
    return api_error(status.HTTP_404_NOT_FOUND, what, "not_found")


# ---------------------------------------------------------------- rate limiting


class RateLimiter:
    """Fixed-window limiter kept in process memory.

    Good enough for a single API instance. Running several instances behind a load balancer
    needs a shared store (Redis) instead; the interface stays the same.
    """

    def __init__(self) -> None:
        self._hits: dict[str, list[float]] = defaultdict(list)

    def hit(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        bucket = [t for t in self._hits[key] if now - t < window]
        if len(bucket) >= limit:
            self._hits[key] = bucket
            return False
        bucket.append(now)
        self._hits[key] = bucket
        return True

    def reset(self) -> None:
        self._hits.clear()


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def rate_limit(scope: str, limit: Callable[[Request], int]) -> Callable[[Request], Awaitable[None]]:
    async def dependency(request: Request) -> None:
        limiter: RateLimiter = request.app.state.limiter
        if not limiter.hit(f"{scope}:{client_ip(request)}", limit(request)):
            raise api_error(429, "Too many requests. Wait a minute and try again.", "rate_limited")

    return dependency
