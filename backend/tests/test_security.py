import uuid
from datetime import timedelta

import jwt
import pytest

from app.core.errors import InvalidTokenError
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)

SECRET = "x" * 40


def test_password_hash_roundtrip():
    hashed = hash_password("s3cret-password")
    assert hashed != "s3cret-password"
    assert verify_password("s3cret-password", hashed)
    assert not verify_password("wrong", hashed)


def test_verify_password_without_hash_is_false():
    assert not verify_password("anything", None)


def test_access_token_roundtrip():
    user_id = uuid.uuid4()
    token, _ = create_access_token(
        user_id, secret=SECRET, algorithm="HS256", ttl=timedelta(minutes=5)
    )
    assert decode_access_token(token, secret=SECRET, algorithm="HS256") == user_id


def test_expired_access_token_rejected():
    token, _ = create_access_token(
        uuid.uuid4(), secret=SECRET, algorithm="HS256", ttl=timedelta(seconds=-1)
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, secret=SECRET, algorithm="HS256")


def test_wrong_signature_rejected():
    token, _ = create_access_token(
        uuid.uuid4(), secret=SECRET, algorithm="HS256", ttl=timedelta(minutes=5)
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, secret="y" * 40, algorithm="HS256")


def test_non_access_token_type_rejected():
    token = jwt.encode({"sub": str(uuid.uuid4()), "type": "refresh", "exp": 9999999999}, SECRET)
    with pytest.raises(InvalidTokenError):
        decode_access_token(token, secret=SECRET, algorithm="HS256")


def test_refresh_token_hash_is_deterministic():
    assert hash_refresh_token("abc") == hash_refresh_token("abc")
    assert hash_refresh_token("abc") != hash_refresh_token("abd")
