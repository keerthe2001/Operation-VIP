# API reference

Base path: `/api/v1`. The live OpenAPI schema is served at `/openapi.json`
(interactive docs at `/docs` outside production) and committed at
`packages/api-types/openapi.json`.

## Conventions

* JSON request and response bodies.
* Authenticated endpoints require `Authorization: Bearer <access_token>`.
* Every response carries an `X-Request-ID` header (send your own to correlate logs).
* Every error uses one shape:

```json
{ "error": { "code": "INVALID_CREDENTIALS", "message": "Incorrect email or password.", "details": null } }
```

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 422 | `details` is a list of `{field, message}` |
| `NOT_AUTHENTICATED` | 401 | No bearer token |
| `INVALID_TOKEN` | 401 | Access or refresh token invalid, expired or revoked |
| `INVALID_CREDENTIALS` | 401 | Wrong email/password, or disabled account |
| `CONFLICT` | 409 | E.g. email already registered |
| `RATE_LIMITED` | 429 | Too many attempts; retry later |
| `NOT_FOUND` | 404 | Unknown route or resource |
| `INTERNAL_ERROR` | 500 | Unexpected failure (logged with the request id) |

## Health

### `GET /health`
`200 {"status":"ok","database":"ok","redis":"ok"}`, or `503` with `"status":"degraded"`.

## Authentication

Two client types are supported:

* **`web`** (default): the refresh token is set as an `HttpOnly` cookie named
  `copilot_refresh`, scoped to `/api/v1/auth`, and is **not** in the response body.
* **`extension`**: the refresh token is returned in the body (`refresh_token`) so
  the extension can store it; no cookie is set.

Access tokens are JWTs valid for `ACCESS_TOKEN_TTL_MINUTES` (default 15). Refresh tokens
are valid for `REFRESH_TOKEN_TTL_DAYS` (default 30) and **rotate on every use**. Re-using
an already-rotated refresh token revokes every token from that sign-in.

### `POST /auth/register` → `201`
Rate limited per IP.
```json
{ "email": "jane@example.com", "password": "at-least-8-chars", "full_name": "Jane Doe", "client": "web" }
```
Response (`TokenResponse`):
```json
{
  "access_token": "eyJ…",
  "token_type": "bearer",
  "expires_at": "2026-11-05T18:00:00Z",
  "refresh_token": null,
  "user": { "id": "…", "email": "jane@example.com", "full_name": "Jane Doe", "created_at": "…" }
}
```
Emails are normalized to lower case; registering an existing email returns `409 CONFLICT`.

### `POST /auth/login` → `200`
Rate limited per IP. Body: `{ "email", "password", "client"? }`. Returns `TokenResponse`.

### `POST /auth/refresh` → `200`
Web: send the cookie (no body). Extension: `{ "refresh_token": "…" }`.
Returns a new `TokenResponse` (and a new cookie / refresh token).

### `POST /auth/logout` → `204`
Revokes the session the given refresh token (cookie or body) belongs to and clears
the cookie. Always succeeds, even without a token.

### `GET /auth/me` → `200`
Returns the current `UserRead`.

## Resumes

| Method & path | Description |
|---|---|
| `POST /resumes/upload` (multipart `file`) | `202` + `ResumeRead`. PDF, DOC, DOCX, PNG, JPG up to `MAX_UPLOAD_MB` (10). Content is sniffed; a mismatched extension is rejected. Re-uploading an identical file returns `409` with `details.resume_id`. Rate limited. |
| `GET /resumes` | Newest first. |
| `GET /resumes/{id}` | Includes `extracted_text`, `extracted_data` (parser output) and `extraction_meta`. |
| `GET /resumes/{id}/status` | `uploaded → scanning → extracting → parsing → ready` or `failed` with `error_code`/`error_message`. |
| `GET /resumes/{id}/file` | Original file (`Content-Security-Policy: sandbox`, `nosniff`). |
| `POST /resumes/{id}/process` | Re-run processing. |
| `DELETE /resumes/{id}` | Deletes the file; the profile is kept. |

Failure codes: `PASSWORD_PROTECTED`, `CORRUPT_FILE`, `NO_TEXT_FOUND`, `MALWARE_DETECTED`,
`SCAN_UNAVAILABLE`, `CONVERSION_FAILED`, `UNSUPPORTED_FILE_TYPE`, `FILE_TOO_LARGE`.

`ResumeRead` also exposes `ocr_confidence` and `warnings` when OCR was used.

## Profile

| Method & path | Description |
|---|---|
| `GET /profile` | Profile (created empty on first read) with `completion`. |
| `PUT /profile` | Replace everything (`ProfileWrite`). |
| `PATCH /profile` | Replace only the provided top-level sections. |
| `GET /profile/completion` | Percentage, per-section status, unconfirmed count. |
| `POST /profile/import/{resume_id}` | Rebuild the profile from a processed resume (keeps `additional_info`). |

Extracted values carry confidence in `field_meta` (scalars) and per item; everything
extracted starts with `is_confirmed: false`. Dates are partial ISO strings (`2021` or `2021-03`).

## Answer library

| Method & path | Description |
|---|---|
| `GET/POST /answers`, `PATCH/DELETE /answers/{id}` | Saved answers: `category`, `question_text`, `answer_template` with `{placeholders}`, `variants`. |
| `GET /answers/templates` | Starter answers (profile placeholders + `[prompts]` to personalize). |
| `GET /answers/placeholders` | Supported placeholders and their meaning. |
| `POST /answers/usages` | Record an inserted answer (`saved_answer_id`, `application_id` optional). |

## Applications

| Method & path | Description |
|---|---|
| `GET /applications?status=&q=` | List, most recently updated first. |
| `POST /applications` | Manual entry; `409` if the (normalized) job URL is already tracked. |
| `GET /applications/{id}` | Detail with `status_history`, `resume_file_name`, inserted `answers`. |
| `PATCH /applications/{id}` | Status, notes, company, title, description, resume. |
| `DELETE /applications/{id}` | Remove. |
| `GET /applications/stats` | Counts by status, active, submitted, responses, response rate, last 8 weeks. |

Statuses: `detected`, `in_progress`, `ready_to_submit`, `submitted`, `interview`, `offer`, `rejected`.

## Extension

| Method & path | Description |
|---|---|
| `GET /extension/profile` | Profile + primary resume + answer library. Supports `If-None-Match` (`304`). |
| `POST /extension/handoff` | New extension session for the signed-in web user (refresh token in the body). |
| `POST /extension/detect-job` | Create/update the application for a detected page (idempotent per URL; never moves status backwards or marks it submitted). |

The originally specified AI endpoints (`/answers/generate`, `/answers/regenerate`,
`/extension/map-fields`, `/extension/generate-answer`) are intentionally not implemented
in the no-AI MVP; mapping and answer suggestions run in the extension.
