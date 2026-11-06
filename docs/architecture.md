# Architecture

This document is the approved architecture for the Job Application Copilot.
The original product brief lives in [`product-spec.md`](./product-spec.md).

> **Key decision — no AI in the MVP.** To keep running costs at zero per request,
> the MVP uses deterministic, rule-based engines everywhere the brief mentions an
> LLM. Every such engine sits behind an interface so an AI implementation can be
> plugged in later by configuration, without rewriting callers.

## 1. Components

```
┌──────────────────────── Browser ────────────────────────┐
│  Web App (React SPA)          Chrome Extension (MV3)    │
│  - onboarding/upload          ┌───────────────────────┐ │
│  - profile review/edit        │ Side Panel (React)    │ │
│  - answer library             └──────────┬────────────┘ │
│  - applications tracker        runtime messages (typed)  │
│        │                      ┌──────────┴────────────┐ │
│        │   token handoff ───▶ │ Background SW         │ │
│        │ (externally_         │ auth · sync · API ·   │ │
│        │  connectable)        │ tab state · router    │ │
│        │                      └──────────┬────────────┘ │
│        │                      ┌──────────┴────────────┐ │
│        │                      │ Content Scripts       │ │
│        │                      │ detect · scan · map · │ │
│        │                      │ fill · observe (DOM)  │ │
│        │                      └───────────────────────┘ │
└────────┼─────────────────────────────────┼──────────────┘
         │ HTTPS REST /api/v1 (JWT)        │
┌────────▼─────────────────────────────────▼──────────────┐
│ FastAPI (API)                                           │
│  routers → services → repositories (SQLAlchemy)          │
│  auth · resumes · profile · applications · answers ·     │
│  extension · rate limiting (Redis) · error middleware    │
└───┬──────────────┬───────────────┬──────────────────────┘
    │              │ enqueue        │
┌───▼────┐   ┌─────▼─────┐   ┌─────▼──────┐
│Postgres│   │  Redis    │   │ MinIO / S3 │
└───▲────┘   │queue/cache│   └─────▲──────┘
    │        └─────┬─────┘         │
┌───┴──────────────▼───────────────┴──────────────────────┐
│ Resume Worker (arq)                                     │
│ validate → ClamAV scan → classify → extract (PyMuPDF /  │
│ Tesseract / docx / LibreOffice) → rule-based parse →    │
│ normalize & validate → confidence → persist              │
└─────────────────────────────────────────────────────────┘
```

### Boundaries

| Component | Owns | Never does |
|---|---|---|
| Content scripts | DOM inspection, detection, field scanning, filling | Network calls, UI |
| Background service worker | Tokens, backend API calls, message routing, tab state | DOM access |
| Side panel | Presentation, user intents (`FILL_ALL`, `INSERT_ANSWER`, …) | DOM access, token storage |
| API routers | HTTP concerns, validation, auth dependencies | Business logic |
| Services | Business logic | SQL, HTTP |
| Repositories | Database access, always scoped by `user_id` | Business rules |

All extension messages are a discriminated union validated with zod on receipt,
and the sender (extension origin / tab id) is checked.

### Pluggable engines (AI-ready)

| Interface | MVP implementation | Future implementation | Config |
|---|---|---|---|
| `ResumeParser` | `RuleBasedParser` | `LLMParser` | `RESUME_PARSER=rules` |
| `OcrProvider` | Tesseract | PaddleOCR | `OCR_PROVIDER=tesseract` |
| `AnswerProvider` | Answer library (templates + fuzzy match) | `LLMAnswerProvider` | `ANSWER_PROVIDER=library` |
| `FieldMapper` (server fallback) | none — low confidence goes to user | LLM mapper | `FIELD_MAPPER_FALLBACK=none` |

Data needed by future AI is captured from day one: `resumes.extracted_text`,
`applications.job_description`, and `resumes.extraction_meta.parser` (parser
version), so existing users can be re-parsed later without re-uploading.

## 2. Technology

| Concern | Choice |
|---|---|
| Web | React + TypeScript, Vite, React Router, TanStack Query, react-hook-form + zod |
| Styling / UI | Tailwind CSS v4, shadcn/ui (shared in `packages/ui`) |
| Extension | Chrome MV3 + Side Panel API, built with WXT |
| Backend | Python 3.12+, FastAPI, SQLAlchemy 2 (async, asyncpg), Alembic, Pydantic v2 |
| Jobs | arq (Redis) |
| Storage | PostgreSQL, Redis, S3/MinIO |
| Documents | pdfplumber + pypdfium2, python-docx, LibreOffice headless (`.doc`), Tesseract OCR, ClamAV |
| Auth | Short-lived JWT access token + rotating opaque refresh token (hashed in DB) |
| Contract | OpenAPI → `openapi-typescript` → `packages/api-types` |
| Tooling | uv, ruff, mypy, pytest · pnpm workspaces, vitest, Playwright |

## 3. Repository layout

```
backend/                 FastAPI app, Alembic, worker, tests
apps/web/                React web application
apps/extension/          Chrome extension (Phase 2)
packages/ui/             Shared shadcn/ui components + Tailwind theme
packages/api-types/      Generated TypeScript types from the OpenAPI schema
packages/shared/         Shared constants/types (field taxonomy, etc.)
infra/                   docker-compose and service config
docs/                    Architecture, API, dev setup, testing
```

## 4. Authentication

* `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `GET /api/v1/auth/me`.
* Access token: JWT (HS256), 15 min default, carries `sub` (user id) and `type=access`.
* Refresh token: 256-bit random opaque string; only its SHA-256 hash is stored.
  Every refresh **rotates** the token. Presenting an already-rotated token is treated
  as theft: the whole token family is revoked.
* Web client: refresh token in an `HttpOnly; Secure; SameSite=Lax` cookie scoped to
  `/api/v1/auth`; the access token stays in memory.
* Extension client (`client: "extension"`): refresh token returned in the body and kept
  in `chrome.storage.local`; obtained via handoff from the web app (Phase 2).
* Passwords hashed with Argon2id. Login and register are rate-limited per IP via Redis.

## 5. Database schema

```sql
users            (id uuid PK, email UNIQUE (stored lower-case), password_hash, full_name,
                  is_active, created_at, updated_at)
refresh_tokens   (id, user_id FK, family_id, token_hash UNIQUE,
                  client ENUM(web,extension), expires_at, revoked_at,
                  replaced_by_id FK NULL, created_at)

resumes          (id, user_id FK, file_name, storage_key, mime_type, size_bytes, sha256,
                  doc_class ENUM(text_pdf,scanned_pdf,image,docx,doc),
                  status ENUM(uploaded,scanning,extracting,parsing,ready,failed),
                  error_code, error_message, extracted_text, page_count,
                  extracted_data JSONB, extraction_meta JSONB,
                  is_primary, created_at, processed_at)
                  UNIQUE (user_id, sha256)

user_profiles    (id, user_id FK UNIQUE, source_resume_id FK NULL,
                  personal_information JSONB, professional_summary JSONB,
                  skills JSONB, additional_info JSONB,
                  field_meta JSONB,   -- {path: {confidence, source, is_confirmed}}
                  created_at, updated_at)
work_experience  (id, profile_id FK, company_name, designation, employment_type, location,
                  start_date, end_date, is_current, responsibilities TEXT[],
                  achievements TEXT[], technologies TEXT[], sort_order, confidence, is_confirmed)
education        (id, profile_id FK, degree, institution, specialization, start_year,
                  graduation_year, grade, sort_order, confidence, is_confirmed)
projects         (id, profile_id FK, project_name, role, url, points TEXT[],
                  sort_order, confidence, is_confirmed)
certifications   (id, profile_id FK, certification_name, issuing_organization, issue_date,
                  credential_url, confidence, is_confirmed)

applications     (id, user_id FK, company_name, job_title, job_url, portal, job_description,
                  resume_id FK NULL,
                  status ENUM(detected,in_progress,ready_to_submit,submitted,rejected,interview,offer),
                  fields_detected, fields_filled, applied_at, created_at, updated_at)
                  UNIQUE (user_id, job_url)

saved_answers    (id, user_id FK, category, question_text, answer_template,
                  variants JSONB, usage_count, created_at, updated_at)
answer_usages    (id, user_id FK, application_id FK, saved_answer_id FK NULL, question_text,
                  final_answer, source ENUM(library,manual,ai), created_at)
```

Tables are added by the phase that needs them. Every repository query is scoped by the
authenticated `user_id`; ids from request bodies are never trusted for ownership.

## 6. Pipelines

### Resume (Phase 1)
1. Upload → validate extension, sniffed MIME type, size (10 MB) → store → `202` + job.
2. Worker: ClamAV scan → classify (text vs scanned PDF by chars/page) → extract text
   (PyMuPDF with column-aware ordering / Tesseract / python-docx / LibreOffice→PDF).
3. `RuleBasedParser`: contact regexes, heading lexicon + font-size/bold cues for sections,
   date-range anchored entry splitting, skills dictionary.
4. Normalize (E.164 phones, ISO dates, validated URLs/emails) → rule-derived confidence.
5. First resume creates the profile with fields **unconfirmed**; later resumes produce a
   merge proposal for review.

### Extension (Phases 2–4)
detect job → scan fields (all frames, shadow DOM) → map by lexicon/attribute scoring
(≥0.85 auto, 0.6–0.85 review, <0.6 user / answer library) → fill with native setters +
`input`/`change` events → MutationObserver re-scan. Never submits.

### Answer library (Phase 4)
Saved answers with `{company}`, `{job_title}`, `{current_designation}`,
`{years_experience}`, `{top_skills}` placeholders, matched to detected questions with
`rapidfuzz` + a synonyms list. Copy / Insert / Edit / Next variant.

## 7. Roadmap

| Phase | Scope | Status |
|---|---|---|
| 0 | Monorepo, docker-compose, CI, FastAPI skeleton, Alembic, auth, web login/register | Done |
| 1a | Upload, text PDF + DOCX, rule-based parser, profile review/edit | Done |
| 1b | Tesseract OCR, images, DOC, ClamAV, duplicates, golden-file tests | Done |
| 2 | Extension foundation: side panel, auth handoff, sync, job detection | Done |
| 3 | Smart autofill | Done |
| 4 | Answer library | Done |
| 5 | Application tracker | Done |
| Future | AI: LLM parser, LLM answers, mapping fallback, PaddleOCR | Planned |

## 8. Risks

| Risk | Mitigation |
|---|---|
| Rule-based parsing misreads unusual layouts | Confidence scores, unconfirmed-by-default, strong review UI, golden-file tests |
| Tesseract weak on low-quality photos | Flag low OCR confidence; PaddleOCR slot for later |
| Portal DOM changes / Workday widgets | Adapter pattern, generic fallback, fixture-based regression tests |
| Cross-origin iframes | `all_frames` injection + host permission for frame origin |
| Broad host permissions in store review | Built-in portals + runtime optional permissions for generic sites |
| MV3 service worker suspension | State persisted in `chrome.storage.session` |

## 9. Decisions made during implementation

| Decision | Why |
|---|---|
| **pdfplumber + pypdfium2 instead of PyMuPDF** | PyMuPDF is AGPL-3.0; serving it from a hosted backend can oblige publishing the backend's source. pdfplumber (MIT) and pypdfium2 (Apache/BSD) provide the same font-size/bold data and page rendering for OCR. Swappable behind the extractor interface. |
| `(cid:N)` glyphs normalized to bullets | pdfminer emits these for unmapped bullet glyphs; left alone they merged bullet lists into one blob. |
| Rule-based mapping on the client (background worker) | No network round-trip per field and no form data leaves the browser; only the profile is synced. |
| Answer matching in `packages/shared` | The same code previews answers on the web and suggests them in the extension, offline. |
| Sensitive fields never auto-filled | Salary, sponsorship, work authorization and demographic answers always need the user's review; EEO questions and consent boxes are never mapped. |
| Status only moves forward automatically | The extension may set *detected* → *in progress*; *submitted* and later are only ever set by the user. |
| Projects are name, role, link and a list of points | Technologies and outcomes duplicated the points and weren't used; every multi-line item is edited one point per field. |
| Achievements only when the resume labels them | Classifying bullets by numbers ("30%") guessed wrong; bullets go to responsibilities unless under an "Achievements" sub-heading. |
| Synthetic corpus with ground truth | Real resumes can't be committed; the generator covers layout variety and turns parser regressions into failing tests. |
| Extension pages identified by URL | A side panel opened in a tab also has `sender.tab`; routing by URL keeps it from being mistaken for a content script. |

## 10. Extension message flow

```
content script ──PAGE_ANALYZED / FIELDS_SCANNED──▶ background ──▶ storage.session (tab:<id>, form:<id>, app:<id>)
side panel ──FILL_FIELDS / INSERT_ANSWER / SAVE_ANSWER / SET_APPLICATION_STATUS──▶ background
background ──FILL {instructions} (per frame)──▶ content script ──results──▶ background
web app ──AUTH_HANDOFF (externally_connectable)──▶ background
side panel ◀── chrome.storage.onChanged (state is read from storage, never pushed)
```
