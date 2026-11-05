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
