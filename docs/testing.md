# Testing

## Backend (`backend/`)

* **Framework:** pytest + pytest-asyncio, httpx `AsyncClient` against the ASGI app.
* **Real services:** tests run against a real Postgres database and Redis instance;
  nothing is mocked at the database layer. The schema is created by running the real
  Alembic migrations (`downgrade base` → `upgrade head`) at the start of each run, and
  tables are truncated between tests.
* **Configuration:**
  * `TEST_DATABASE_URL` (default `postgresql+asyncpg://copilot:copilot@localhost:5432/copilot_test`)
  * `TEST_REDIS_URL` (default `redis://localhost:6379/15`; flushed between tests)

```bash
# one-time: create the test database
createdb -h localhost -U copilot copilot_test   # or: docker compose exec postgres createdb -U copilot copilot_test
cd backend
uv run pytest -q
uv run ruff check . && uv run ruff format --check . && uv run mypy
```

Coverage today:

| File | Covers |
|---|---|
| `tests/test_security.py` | Password hashing, JWT creation/expiry/signature/type checks, refresh-token hashing |
| `tests/test_auth_api.py` | Register, duplicate email (case-insensitive), validation error shape, login success/failure, web cookie vs extension body tokens, refresh rotation, reuse detection revoking the family, logout, `/me` with missing/garbage/expired tokens, rate limiting, health, 404 shape |

## Frontend (`apps/web/`)

* **Framework:** Vitest + Testing Library (jsdom).
* `src/lib/api/client.test.ts`: token injection, refresh-and-retry, single-flight refresh
  for concurrent 401s, session cleared when refresh fails, no refresh loop on auth endpoints.
* `src/lib/api/errors.test.ts`: API error parsing.
* `src/features/auth/auth-flow.test.tsx`: route guards, client validation, sign-in,
  server errors, server field errors mapped to inputs, register + sign-out.

```bash
pnpm test        # all workspaces
pnpm typecheck
pnpm lint
```

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main` and every pull request:

1. **backend:** ruff, format check, mypy (strict), pytest with Postgres and Redis
   service containers, and `alembic check` to make sure migrations match the models.
2. **api-contract:** regenerates the OpenAPI schema and TypeScript types and fails if
   they differ from what is committed.
3. **frontend:** typecheck, lint, test and build.

## Manual end-to-end check

With the API and web app running (see the README), the Phase 0 flow was verified in
Chromium: register → dashboard → reload (session restored from cookie) → sign out →
reload (stays signed out) → wrong password error → sign in.
