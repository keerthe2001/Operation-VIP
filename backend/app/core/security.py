"""Password hashing, access tokens (JWT) and refresh tokens (opaque)."""

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from app.core.errors import InvalidTokenError

_hasher = PasswordHasher()
# Used to keep login timing similar whether or not the email exists.
_DUMMY_HASH = _hasher.hash("timing-equalizer-password")


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, password_hash: str | None) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


def create_access_token(
    user_id: uuid.UUID, *, secret: str, algorithm: str, ttl: timedelta
) -> tuple[str, datetime]:
    now = datetime.now(UTC)
    expires_at = now + ttl
    payload = {
        "sub": str(user_id),
        "type": "access",
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm=algorithm), expires_at


def decode_access_token(token: str, *, secret: str, algorithm: str) -> uuid.UUID:
    try:
        payload = jwt.decode(
            token, secret, algorithms=[algorithm], options={"require": ["exp", "sub", "type"]}
        )
        if payload.get("type") != "access":
            raise InvalidTokenError()
        return uuid.UUID(payload["sub"])
    except (jwt.PyJWTError, ValueError) as exc:
        raise InvalidTokenError() from exc


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()
