# Job Application Copilot

Upload your resume once, then let a browser side panel autofill job applications
across Greenhouse, Lever, Workday, Ashby, LinkedIn and generic career pages.

* **Architecture:** [`docs/architecture.md`](docs/architecture.md)
* **Original product brief:** [`docs/product-spec.md`](docs/product-spec.md)
* **API reference:** [`docs/api.md`](docs/api.md)
* **Testing:** [`docs/testing.md`](docs/testing.md)

The MVP deliberately uses **no paid AI services**: resume parsing, field mapping and
answer suggestions are rule-based, behind interfaces that allow AI implementations
to be added later (see the architecture doc).

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, Docker Compose, CI, FastAPI skeleton, migrations, authentication, web sign-in/sign-up | ✅ Done |
| 1a | Resume upload, text PDF/DOCX extraction, rule-based parser, profile review | Next |
| 1b–5 | OCR, extension, autofill, answer library, tracker | Planned |

## Repository layout

```
backend/              FastAPI API, Alembic migrations, tests
apps/web/             React web app (Vite, Tailwind, shadcn/ui)
packages/ui/          Shared UI components and design tokens
packages/api-types/   TypeScript types generated from the API's OpenAPI schema
infra/                Docker Compose for local services
docs/                 Architecture, API, testing
```

## Local development

### Prerequisites

* Python 3.12+ and [uv](https://docs.astral.sh/uv/)
* Node.js 20+ and pnpm 10 (`corepack enable`)
* Docker (for Postgres and Redis), or local Postgres 16 and Redis 7

### 1. Start Postgres and Redis

```bash
cp infra/.env.example infra/.env        # set JWT_SECRET (only needed for the api service)
docker compose -f infra/docker-compose.yml up -d postgres redis
```

To run the API in Docker too, use `docker compose -f infra/docker-compose.yml up --build`.

### 2. Run the API

```bash
cd backend
cp .env.example .env                    # set JWT_SECRET to a long random value
uv sync
uv run alembic upgrade head
uv run uvicorn app.asgi:app --reload --port 8000
```

Interactive docs: <http://localhost:8000/docs>. Health check: `GET /api/v1/health`.

### 3. Run the web app

```bash
pnpm install
pnpm dev:web                            # http://localhost:5173
```

Vite proxies `/api` to `http://localhost:8000`, so the web app and API share an
origin and the HttpOnly refresh cookie works without CORS. Override the target with
`VITE_API_PROXY_TARGET`.

### Common commands

| Command | What it does |
|---|---|
| `pnpm test` / `pnpm typecheck` / `pnpm lint` / `pnpm build` | Frontend checks across workspaces |
| `cd backend && uv run pytest` | Backend tests (needs Postgres + Redis; see `docs/testing.md`) |
| `cd backend && uv run ruff check . && uv run mypy` | Backend lint and strict type check |
| `pnpm api-types` | Regenerate `packages/api-types` after changing API schemas |
| `cd backend && uv run alembic revision --autogenerate -m "..."` | New migration |

## Configuration

All configuration is environment-based; see [`backend/.env.example`](backend/.env.example).
Secrets (`JWT_SECRET`, later storage credentials) have no defaults, and the API refuses
to start without them. Never commit `.env` files.
