# Testing

| Suite | Command | Count |
|---|---|---|
| Backend (pytest, real Postgres + Redis) | `cd backend && uv run pytest` | 107 |
| Shared logic (vitest) | `pnpm --filter @copilot/shared test` | 21 |
| Web app (vitest + Testing Library) | `pnpm --filter @copilot/web test` | 36 |
| Extension (vitest + Testing Library) | `pnpm --filter @copilot/extension test` | 109 |
| Extension E2E (Playwright, real Chromium) | `node apps/extension/e2e/run.mjs` | 36 checks |

## Backend

* Runs against a real Postgres database and Redis; the schema is built with the real
  Alembic migrations (`downgrade base` → `upgrade head`) and tables are truncated between tests.
* `TEST_DATABASE_URL` (default `postgresql+asyncpg://copilot:copilot@localhost:5432/copilot_test`)
  and `TEST_REDIS_URL` (default `redis://localhost:6379/15`).
* Real PDFs and DOCX files are generated from fixtures (`tests/fixtures/documents.py`), so the
  extractors are exercised end to end, including two-column layouts, encrypted PDFs, images
  and scanned PDFs (OCR), and legacy `.doc` (converted with LibreOffice).
* Tests that need `tesseract`, `soffice` or `clamd` are skipped when the binary is missing.
  The ClamAV test starts a real `clamd` with a private signature database containing a
  test signature, so it needs no internet access.
* **Golden files** (`tests/golden/*.json`): four resume styles rendered to PDF and parsed;
  the output is compared with reviewed snapshots, and DOCX output must equal PDF output.
  After an intentional parser change, review the diff and run
  `UPDATE_GOLDEN=1 uv run pytest tests/test_golden.py`.

| File | Covers |
|---|---|
| `test_security.py`, `test_auth_api.py` | Hashing, JWTs, register/login/refresh rotation/reuse detection/logout, rate limiting |
| `test_parser.py`, `test_golden.py` | Rule-based parser: contact, sections, experience, education, skills, projects, certifications, dates |
| `test_extractors.py`, `test_ocr_doc_scan.py` | Validation, PDF/DOCX/DOC/image extraction, OCR, decompression bombs, ClamAV, fail-closed scanning |
| `test_resumes_api.py`, `test_profile_api.py`, `test_storage.py`, `test_worker.py` | Upload pipeline, duplicates, isolation between users, profile CRUD/completion, S3 (moto), arq queue |
| `test_extension_api.py`, `test_answers_api.py`, `test_applications_api.py` | ETag sync, handoff, answer library, tracker (idempotent detection, forward-only status, stats) |

## Frontend and extension

* Web: auth flow, profile review (review markers, confirm-on-edit, validation), uploads,
  resume management, extension connection, answer library editor, applications tracker.
* Extension: job detection on fixtures for every portal, message validation, auth manager
  (rotation, single-flight refresh, offline), profile sync with ETags, field mapping
  (60+ real-world labels), option matching, form scanning (including shadow DOM), the DOM
  writer against **real React controlled components**, autofill coordination per frame,
  answer suggestions, application tracking, and the side panel UI.

## Extension E2E (real browser)

`apps/extension/e2e/run.mjs` loads the built extension into Chromium (new headless mode)
and drives the real API and web app. Job portal URLs are intercepted and served from
fixtures; no third-party site is contacted.

```bash
# API on :8000 and web app on :5173 running, then:
pnpm --filter @copilot/extension build
RESUME_PDF=path/to/resume.pdf node apps/extension/e2e/run.mjs [screenshot-dir]
```

It checks: stable extension ID; sign-in screen; web → extension session handoff; token
storage; profile sync; Greenhouse detection; Autofill (text, select range, resume file
upload) while leaving questions and sensitive fields alone; Review & fill; answer library
suggestion with placeholders and Insert; application tracking and "I submitted";
an embedded Greenhouse iframe; a two-step Workday form; no injection on unsupported sites;
sign-out.

## Continuous integration

`.github/workflows/ci.yml`: backend (ruff, format, strict mypy, pytest with Postgres/Redis
and Tesseract, `alembic check`), API contract drift, and all TypeScript workspaces
(typecheck, lint, test, build). The browser E2E needs running servers and is run manually.
