import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    full_name: str | None
    created_at: datetime


class _Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    client: Literal["web", "extension"] = "web"

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class RegisterRequest(_Credentials):
    full_name: str | None = Field(default=None, max_length=200)

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        value = value.strip() if value else None
        return value or None


class LoginRequest(_Credentials):
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    """Extension clients send the refresh token in the body; web clients use the cookie."""

    refresh_token: str | None = Field(default=None, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105
    expires_at: datetime
    # Only returned to extension clients; web clients receive an HttpOnly cookie.
    refresh_token: str | None = None
    user: UserRead
