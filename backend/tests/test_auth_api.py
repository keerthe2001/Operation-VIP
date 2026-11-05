from datetime import timedelta

from httpx import AsyncClient

from app.core.security import create_access_token
from tests.conftest import register

COOKIE = "copilot_refresh"


async def test_register_sets_cookie_and_returns_user(client: AsyncClient):
    response = await register(client, email="Jane@Example.com")
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "jane@example.com"
    assert body["user"]["full_name"] == "Jane Doe"
    assert body["refresh_token"] is None
    set_cookie = response.headers["set-cookie"]
    assert f"{COOKIE}=" in set_cookie
    assert "HttpOnly" in set_cookie
    assert "Path=/api/v1/auth" in set_cookie

    me = await client.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.status_code == 200
    assert me.json()["email"] == "jane@example.com"


async def test_register_duplicate_email_is_case_insensitive(client: AsyncClient):
    assert (await register(client, email="jane@example.com")).status_code == 201
    response = await register(client, email="JANE@example.com")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


async def test_register_validation_errors(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register", json={"email": "not-an-email", "password": "short"}
    )
    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert {d["field"] for d in error["details"]} == {"email", "password"}


async def test_login_success_and_failures(client: AsyncClient):
    await register(client)
    ok = await client.post(
        "/api/v1/auth/login",
        json={"email": "jane@example.com", "password": "correct-horse-battery"},
    )
    assert ok.status_code == 200
    assert ok.json()["access_token"]

    wrong = await client.post(
        "/api/v1/auth/login", json={"email": "jane@example.com", "password": "nope-nope-nope"}
    )
    unknown = await client.post(
        "/api/v1/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"}
    )
    for response in (wrong, unknown):
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"


async def test_extension_login_returns_refresh_token_in_body(client: AsyncClient):
    await register(client)
    client.cookies.clear()
    response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "jane@example.com",
            "password": "correct-horse-battery",
            "client": "extension",
        },
    )
    assert response.status_code == 200
    assert response.json()["refresh_token"]
    assert "set-cookie" not in response.headers

    refreshed = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": response.json()["refresh_token"]}
    )
    assert refreshed.status_code == 200
    assert refreshed.json()["refresh_token"] not in (None, response.json()["refresh_token"])


async def test_refresh_rotates_cookie(client: AsyncClient):
    await register(client)
    first = client.cookies[COOKIE]
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert response.json()["access_token"]
    assert client.cookies[COOKIE] != first


async def test_reusing_rotated_token_revokes_family(client: AsyncClient):
    await register(client)
    stolen = client.cookies[COOKIE]
    assert (await client.post("/api/v1/auth/refresh")).status_code == 200
    current = client.cookies[COOKIE]

    reuse = await client.post("/api/v1/auth/refresh", json={"refresh_token": stolen})
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "INVALID_TOKEN"

    # The legitimate, newer token is revoked too.
    after = await client.post("/api/v1/auth/refresh", json={"refresh_token": current})
    assert after.status_code == 401


async def test_refresh_without_token(client: AsyncClient):
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_TOKEN"


async def test_logout_revokes_session(client: AsyncClient):
    await register(client)
    token = client.cookies[COOKIE]
    response = await client.post("/api/v1/auth/logout")
    assert response.status_code == 204
    assert COOKIE not in client.cookies
    again = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert again.status_code == 401


async def test_me_requires_valid_token(client: AsyncClient, settings):
    missing = await client.get("/api/v1/auth/me")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "NOT_AUTHENTICATED"

    garbage = await client.get("/api/v1/auth/me", headers={"Authorization": "Bearer garbage"})
    assert garbage.json()["error"]["code"] == "INVALID_TOKEN"

    user_id = (await register(client)).json()["user"]["id"]
    import uuid

    expired, _ = create_access_token(
        uuid.UUID(user_id),
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        ttl=timedelta(seconds=-5),
    )
    response = await client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert response.status_code == 401


async def test_login_is_rate_limited(client: AsyncClient, app):
    original = app.state.settings.rate_limit_auth_per_minute
    app.state.settings.rate_limit_auth_per_minute = 3
    try:
        payload = {"email": "a@example.com", "password": "whatever-123"}
        codes = [
            (await client.post("/api/v1/auth/login", json=payload)).status_code for _ in range(4)
        ]
    finally:
        app.state.settings.rate_limit_auth_per_minute = original
    assert codes == [401, 401, 401, 429]


async def test_health(client: AsyncClient):
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok", "redis": "ok"}
    assert response.headers["x-request-id"]


async def test_unknown_route_uses_error_shape(client: AsyncClient):
    response = await client.get("/api/v1/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOT_FOUND"
