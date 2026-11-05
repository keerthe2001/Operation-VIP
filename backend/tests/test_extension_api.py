from httpx import AsyncClient

from tests.conftest import auth_headers
from tests.fixtures.documents import make_pdf
from tests.fixtures.sample_resumes import ENGINEER


async def test_extension_profile_with_etag(client: AsyncClient):
    headers = await auth_headers(client)
    first = await client.get("/api/v1/extension/profile", headers=headers)
    assert first.status_code == 200
    body = first.json()
    assert body["primary_resume"] is None
    assert body["profile"]["completion"]["percentage"] == 0
    etag = first.headers["etag"]

    unchanged = await client.get(
        "/api/v1/extension/profile", headers={**headers, "If-None-Match": etag}
    )
    assert unchanged.status_code == 304

    await client.post(
        "/api/v1/resumes/upload",
        headers=headers,
        files={"file": ("cv.pdf", make_pdf(ENGINEER), "application/pdf")},
    )
    changed = await client.get(
        "/api/v1/extension/profile", headers={**headers, "If-None-Match": etag}
    )
    assert changed.status_code == 200
    assert changed.json()["primary_resume"]["status"] == "ready"
    assert changed.json()["profile"]["personal_information"]["full_name"] == "Priya Raman"


async def test_handoff_issues_extension_session(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.post("/api/v1/extension/handoff", headers=headers)
    assert response.status_code == 200
    token = response.json()["refresh_token"]
    client.cookies.clear()
    refreshed = await client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert refreshed.status_code == 200
    # Extension sessions get their refresh token in the body, never as a cookie.
    assert refreshed.json()["refresh_token"]
    assert "set-cookie" not in refreshed.headers


async def test_extension_endpoints_require_auth(client: AsyncClient):
    assert (await client.get("/api/v1/extension/profile")).status_code == 401
    assert (await client.post("/api/v1/extension/handoff")).status_code == 401


async def test_etag_changes_when_only_list_items_change(client: AsyncClient):
    headers = await auth_headers(client)
    etag = (await client.get("/api/v1/extension/profile", headers=headers)).headers["etag"]
    await client.patch("/api/v1/profile", headers=headers, json={"experience": [{"company_name": "Acme"}]})
    again = await client.get("/api/v1/extension/profile", headers={**headers, "If-None-Match": etag})
    assert again.status_code == 200
