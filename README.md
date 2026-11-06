# Job Application Copilot

Upload your resume once. Copilot builds a reusable profile from it, and a Chrome side
panel recognizes job applications on Greenhouse, Lever, Workday, Ashby, LinkedIn and
company career sites, fills the fields it can, suggests answers from your own answer
library, and tracks every application. **You always review and submit yourself.**

The MVP uses **no paid AI services**: resume parsing, field mapping and answer
suggestions are rule-based and run on your own infrastructure. Each engine sits behind
an interface so AI can be added later (see [`docs/architecture.md`](docs/architecture.md)).

| Doc | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Components, decisions, schema, roadmap |
| [`docs/api.md`](docs/api.md) | REST API reference |
| [`docs/testing.md`](docs/testing.md) | Test suites and the browser E2E |
| [`docs/product-spec.md`](docs/product-spec.md) | Original product brief |

## Status

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, Docker Compose, CI, auth, web sign-in | ✅ |
| 1a | Resume upload, PDF/DOCX extraction, rule-based parser, profile review | ✅ |
| 1b | OCR (images, scanned PDFs), legacy .doc, malware scanning, golden tests | ✅ |
| 2 | Chrome extension: side panel, sign-in/handoff, profile sync, job detection | ✅ |
| 3 | Smart autofill: field scanning, confidence mapping, filling, multi-step forms | ✅ |
| 4 | Answer library (replaces AI answers for now) | ✅ |
| 5 | Application tracker with analytics | ✅ |
| Future | AI parser/answers (pluggable), PaddleOCR | Planned |

## Repository layout

```
backend/              FastAPI API, resume pipeline, arq worker, Alembic, tests
apps/web/             React web app (profile, resumes, answers, applications)
apps/extension/       Chrome MV3 extension (background, content script, side panel)
packages/ui/          Shared shadcn/ui components and design tokens
packages/shared/      Shared logic (answer matching and templates)
packages/api-types/   TypeScript types generated from the OpenAPI schema
infra/                Docker Compose
docs/                 Architecture, API, testing
```

## Local development

### Prerequisites

* Python 3.12+ and [uv](https://docs.astral.sh/uv/); Node.js 20+ and pnpm 10
* Postgres 16 and Redis 7 (via Docker or installed locally)
* Optional, for every file type: `tesseract-ocr` (scanned/image resumes),
  LibreOffice (`.doc`), ClamAV `clamd` (virus scanning)

### Run it

```bash
# 1. Services
cp infra/.env.example infra/.env            # set JWT_SECRET (Compose checks it even for postgres/redis)
docker compose -f infra/docker-compose.yml up -d postgres redis

# 2. API (processes resumes in-process by default)
cd backend
cp .env.example .env                        # set JWT_SECRET
uv sync && uv run alembic upgrade head
uv run uvicorn app.asgi:app --reload --port 8000

# 3. Web app (http://localhost:5173, proxies /api to :8000)
pnpm install && pnpm dev:web

# 4. Extension
pnpm --filter @copilot/extension build      # API_URL / WEB_URL env vars override the defaults
# chrome://extensions → Developer mode → Load unpacked → apps/extension/dist
```

The extension's ID is fixed by the public key in `apps/extension/extension-key.pub.txt`
(`ghnfgeieaebkhfpmgkbmikimkhidhmce`), so the web app can hand it a session. If you
publish under a different key, set `VITE_EXTENSION_ID` for the web app.

To run everything in containers instead: `docker compose -f infra/docker-compose.yml up --build`
(API, a worker with Tesseract and LibreOffice, Postgres, Redis; add `--profile scan`
with `MALWARE_SCANNER=clamd` for virus scanning).

### Common commands

| Command | What it does |
|---|---|
| `pnpm test` / `typecheck` / `lint` / `build` | All TypeScript workspaces |
| `cd backend && uv run pytest` | Backend tests (Postgres + Redis required) |
| `cd backend && uv run ruff check . && uv run mypy` | Backend lint and strict typing |
| `pnpm api-types` | Regenerate API types after changing backend schemas |
| `node apps/extension/e2e/run.mjs` | Real-browser E2E (see `docs/testing.md`) |

## Configuration

Environment-based; see [`backend/.env.example`](backend/.env.example). Notable settings:

| Variable | Default | Meaning |
|---|---|---|
| `JWT_SECRET` | – (required) | Signing key for access tokens |
| `RESUME_PROCESSING_MODE` | `inline` | `queue` hands resumes to the arq worker |
| `STORAGE_BACKEND` | `local` | `s3` for any S3-compatible store (`S3_*` vars) |
| `OCR_PROVIDER` | `tesseract` | `none` disables OCR |
| `MALWARE_SCANNER` | `none` | `clamd` streams uploads to ClamAV (`CLAMD_*` vars) |
| `DEFAULT_PHONE_REGION` | `US` | Country for phone numbers without a `+` prefix |

## Privacy

Resumes and profile data stay in your database and storage. The extension only runs on
supported job portals unless you allow other sites; it reads pages to find application
forms and never submits them. No data is sent to third-party AI services.
