import os
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.content import sync_content
from app.main import create_app
from app.models import Base

TEST_DB = os.environ.get(
    "HX_TEST_DATABASE_URL",
    "postgresql+asyncpg://huntexams:huntexams@localhost:5433/huntexams_test",
)
CONTENT = Path(__file__).resolve().parent.parent / "content"


@pytest.fixture(scope="session")
async def app():  # type: ignore[no-untyped-def]
    settings = Settings(
        app_env="test",
        database_url=TEST_DB,
        secret_key="t" * 40,
        cookie_secure=False,
        admin_emails=["admin@test.dev"],
        seed_content_on_startup=False,
        rate_limit_auth_per_minute=1000,
        rate_limit_writes_per_minute=10000,
    )
    application = create_app(settings)
    engine = application.state.db.engine
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    async with application.state.db.sessionmaker() as session:
        await sync_content(session, CONTENT, overwrite=True)
    yield application
    await application.state.db.dispose()


@pytest.fixture
async def client(app) -> AsyncIterator[AsyncClient]:  # type: ignore[no-untyped-def]
    app.state.limiter.reset()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers={"X-HX-Client": "web"}
    ) as c:
        yield c


_counter = iter(range(1, 10_000))


async def register(client: AsyncClient, email: str | None = None, name: str = "Priya") -> dict:
    email = email or f"learner{next(_counter)}@test.dev"
    r = await client.post(
        "/api/auth/register", json={"name": name, "email": email, "password": "correct-horse-1"}
    )
    assert r.status_code == 201, r.text
    return r.json()
