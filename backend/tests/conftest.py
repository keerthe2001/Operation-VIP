import os
import subprocess
import sys
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

# Configure the environment before the app (and its settings) are imported.
os.environ.setdefault(
    "TEST_DATABASE_URL", "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot_test"
)
os.environ["DATABASE_URL"] = os.environ["TEST_DATABASE_URL"]
os.environ.setdefault("TEST_REDIS_URL", "redis://localhost:6379/15")
os.environ["REDIS_URL"] = os.environ["TEST_REDIS_URL"]
os.environ["APP_ENV"] = "test"
os.environ["JWT_SECRET"] = "test-secret-that-is-at-least-32-characters-long"
os.environ["COOKIE_SECURE"] = "false"
os.environ["RESUME_PROCESSING_MODE"] = "inline"
os.environ["STORAGE_BACKEND"] = "local"
os.environ["STORAGE_LOCAL_ROOT"] = tempfile.mkdtemp(prefix="copilot-test-storage-")
os.environ["DEFAULT_PHONE_REGION"] = "US"

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.core.config import Settings
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[1]


def _alembic(*args: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, check=True, capture_output=True
    )


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings()


@pytest.fixture(scope="session")
async def app(settings: Settings) -> AsyncIterator[FastAPI]:
    # Exercise the real migrations rather than metadata.create_all().
    _alembic("downgrade", "base")
    _alembic("upgrade", "head")
    application = create_app(settings)
    yield application
    await application.state.redis.aclose()
    await application.state.db.dispose()


@pytest.fixture(autouse=True)
async def _clean_state(app: FastAPI) -> AsyncIterator[None]:
    async with app.state.db.engine.begin() as conn:
        await conn.execute(
            text(
                "TRUNCATE users, refresh_tokens, resumes, user_profiles, work_experience, "
                "education, projects, certifications, saved_answers, answer_usages, applications CASCADE"
            )
        )
    await app.state.redis.flushdb()
    yield


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


async def register(client: AsyncClient, email: str = "jane@example.com", **extra: object):
    payload = {"email": email, "password": "correct-horse-battery", "full_name": "Jane Doe"}
    payload.update(extra)
    return await client.post("/api/v1/auth/register", json=payload)


async def auth_headers(client: AsyncClient, email: str = "jane@example.com") -> dict[str, str]:
    response = await register(client, email=email)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}
