# Testing

| Suite | Command | Count |
|---|---|---|
| Backend (pytest, real Postgres + Redis) | `cd backend && uv run pytest` | 116 |
| Resume corpus (part of backend) | `uv run pytest tests/test_corpus.py` | 150 + 20 resumes |
| Shared logic (vitest) | `pnpm --filter @copilot/shared test` | 23 |
| Web app (vitest + Testing Library) | `pnpm --filter @copilot/web test` | 38 |
| Extension (vitest + Testing Library) | `pnpm --filter @copilot/extension test` | 111 |
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

## Resume corpus (parser regression)

`backend/tests/corpus/generator.py` builds fictional resumes with known ground truth and
renders each with a random combination of real-world variations: PDF (four fonts, two-column
sidebars, page sizes), DOCX (Word heading styles or bold runs, real list bullets, tables),
Word-exported PDF and legacy `.doc` (via LibreOffice) and phone-photo PNGs (via OCR);
headings in caps or title case with synonyms; bullet glyphs `• - * ▪ –`, numbers, Word's
Symbol bullet or none; title-first or company-first; separators `| — , at`; six date
formats; dates inline, on their own line, or in parentheses; shuffled and missing sections.

* `tests/test_corpus.py` (runs in CI) fails if any field family drops below 98% on the fixed
  seeds, or fewer than 95% of resumes are fully correct.
* Explore with `uv run python -m scripts.evaluate_parser --count 300 --start <seed> [--formats pdf,docx]`.
  It prints per-field accuracy, per-format results and the failing seeds to inspect.

Latest run on 500 unseen resumes (all formats): 495 fully correct; every field family ≥ 99.6%.
The remaining errors are OCR letter misreads ("Iyer" → "lyer"). These are synthetic
resumes; real-world resumes with heavy design (icons instead of labels, text in graphics)
are not covered yet, so add generator variations when a real resume parses badly.

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
E2E=1 pnpm --filter @copilot/extension build   # opens the assistant's shadow root for the test
RESUME_PDF=path/to/resume.pdf node apps/extension/e2e/run.mjs [screenshot-dir]
```

It checks: stable extension ID; sign-in screen; web → extension session handoff; token
storage; profile sync; Greenhouse detection; Autofill (text, select range, resume file
upload) while leaving questions and sensitive fields alone; Review & fill; answer library
suggestion with placeholders and Insert; application tracking and "I submitted";
an embedded Greenhouse iframe; a two-step Workday form; a plain careers form with a hidden CV
input; "Fill this page anyway" on an unrecognised form; the floating assistant (bubble on a Naukri-style
posting, job match, save job, drag-to-dock, auto-open and one-click autofill); no injection on unsupported sites;
sign-out.

## Continuous integration

`.github/workflows/ci.yml`: backend (ruff, format, strict mypy, pytest with Postgres/Redis
and Tesseract, `alembic check`), API contract drift, and all TypeScript workspaces
(typecheck, lint, test, build). The browser E2E needs running servers and is run manually.
