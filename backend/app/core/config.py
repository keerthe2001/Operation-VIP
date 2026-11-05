from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (and `.env` in development).

    Secrets have no defaults: the app refuses to start without them.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_name: str = "Job Application Copilot"
    log_level: str = "INFO"

    database_url: str = "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot"
    redis_url: str = "redis://localhost:6379/0"

    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = Field(default=15, ge=1, le=60)
    refresh_token_ttl_days: int = Field(default=30, ge=1, le=90)

    refresh_cookie_name: str = "copilot_refresh"
    cookie_secure: bool = True

    cors_origins: Annotated[list[str], NoDecode] = []

    rate_limit_auth_per_minute: int = Field(default=10, ge=1)
    rate_limit_upload_per_minute: int = Field(default=10, ge=1)

    # File storage: "local" (directory on disk) or "s3" (any S3-compatible service).
    storage_backend: Literal["local", "s3"] = "local"
    storage_local_root: str = "./var/storage"
    s3_bucket: str = "copilot-resumes"
    s3_endpoint_url: str | None = None
    s3_region: str = "us-east-1"
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None

    # Resume processing: "inline" runs after the response in the API process (dev),
    # "queue" hands the job to the arq worker (production).
    resume_processing_mode: Literal["inline", "queue"] = "inline"
    max_upload_mb: int = Field(default=10, ge=1, le=50)
    # Pluggable engines (see docs/architecture.md). Only rule-based engines exist today.
    resume_parser: Literal["rules"] = "rules"
    ocr_provider: Literal["tesseract", "none"] = "tesseract"
    ocr_languages: str = "eng"
    ocr_dpi: int = Field(default=300, ge=100, le=600)
    ocr_max_pages: int = Field(default=6, ge=1, le=30)
    libreoffice_binary: str = "soffice"
    # Malware scanning: "clamd" streams every upload to a ClamAV daemon.
    malware_scanner: Literal["none", "clamd"] = "none"
    clamd_host: str = "localhost"
    clamd_port: int = 3310
    clamd_socket: str | None = None
    # When true, uploads are rejected if the scanner cannot be reached (fail closed).
    malware_scan_required: bool = True
    default_phone_region: str = "US"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
