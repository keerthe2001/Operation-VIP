from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def normalise_db_url(url: str) -> str:
    """Hosting providers hand out postgres:// URLs; SQLAlchemy async needs +asyncpg."""
    for prefix in ("postgres://", "postgresql://"):
        if url.startswith(prefix):
            return "postgresql+asyncpg://" + url[len(prefix) :]
    return url


class Settings(BaseSettings):
    """HuntExams API settings, read from environment variables (and `.env` in development).

    Secrets have no defaults, so the app refuses to start without them.
    """

    model_config = SettingsConfigDict(
        env_prefix="HX_", env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_env: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://huntexams:huntexams@localhost:5432/huntexams"

    # Signs password-reset and certificate links. Never commit a real value.
    secret_key: str = Field(min_length=32)

    session_cookie_name: str = "hx_session"
    session_ttl_days: int = Field(default=30, ge=1, le=90)
    cookie_secure: bool = True

    cors_origins: Annotated[list[str], NoDecode] = []
    public_site_url: str = "http://localhost:5174"

    rate_limit_auth_per_minute: int = Field(default=10, ge=1)
    rate_limit_writes_per_minute: int = Field(default=120, ge=1)

    # Emails listed here become admins when they register or log in.
    admin_emails: Annotated[list[str], NoDecode] = []

    # Google AdSense stays off until the site is approved and these are set.
    adsense_publisher_id: str | None = None

    # Curriculum source loaded on startup when the database has no content yet.
    content_dir: str = "content"
    seed_content_on_startup: bool = True

    # Built web app (Vite dist). When set, the API also serves the website from the same
    # origin, which is how the single-service Render deployment works.
    web_dist: str | None = None

    @field_validator("database_url", mode="before")
    @classmethod
    def _asyncpg(cls, value: object) -> object:
        return normalise_db_url(value) if isinstance(value, str) else value

    @field_validator("cors_origins", "admin_emails", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        if isinstance(value, str):
            return [part.strip() for part in value.split(",") if part.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
