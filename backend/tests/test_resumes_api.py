import uuid

from httpx import AsyncClient

from tests.conftest import auth_headers
from tests.fixtures.documents import blank_pdf, encrypt_pdf, make_docx, make_pdf
from tests.fixtures.sample_resumes import ENGINEER, MINIMAL

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


async def upload(client, headers, name, data, mime="application/pdf"):
    return await client.post(
        "/api/v1/resumes/upload", headers=headers, files={"file": (name, data, mime)}
    )


async def test_upload_pdf_processes_and_seeds_profile(client: AsyncClient):
    headers = await auth_headers(client)
    response = await upload(client, headers, "priya.pdf", make_pdf(ENGINEER))
    assert response.status_code == 202
    resume = response.json()
    assert resume["file_name"] == "priya.pdf"
    assert resume["is_primary"] is True

    # Inline mode: processing ran as a background task before the response completed.
    status = (await client.get(f"/api/v1/resumes/{resume['id']}/status", headers=headers)).json()
    assert status["status"] == "ready", status

    detail = (await client.get(f"/api/v1/resumes/{resume['id']}", headers=headers)).json()
    assert detail["doc_class"] == "text_pdf"
    assert detail["page_count"] == 1
    assert "Priya Raman" in detail["extracted_text"]
    assert detail["extraction_meta"]["parser"] == "rules-1.0"
    assert detail["extracted_data"]["personal_information"]["email"] == "priya.raman@example.com"

    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["source_resume_id"] == resume["id"]
    assert profile["personal_information"]["full_name"] == "Priya Raman"
    assert len(profile["experience"]) == 3
    assert profile["experience"][0]["is_confirmed"] is False
    assert profile["field_meta"]["personal_information.email"]["is_confirmed"] is False
    assert profile["completion"]["sections"]["resume"] == "complete"
    assert profile["completion"]["unconfirmed_fields"] > 0


async def test_upload_docx(client: AsyncClient):
    headers = await auth_headers(client)
    response = await upload(client, headers, "john.docx", make_docx(MINIMAL), DOCX_MIME)
    assert response.status_code == 202
    detail = (await client.get(f"/api/v1/resumes/{response.json()['id']}", headers=headers)).json()
    assert detail["status"] == "ready"
    assert detail["doc_class"] == "docx"
    assert detail["extracted_data"]["experience"][0]["designation"] == "Barista"


async def test_second_resume_does_not_overwrite_profile_until_imported(client: AsyncClient):
    headers = await auth_headers(client)
    first = (await upload(client, headers, "a.pdf", make_pdf(ENGINEER))).json()
    second = (await upload(client, headers, "b.docx", make_docx(MINIMAL), DOCX_MIME)).json()

    resumes = (await client.get("/api/v1/resumes", headers=headers)).json()
    assert [r["id"] for r in resumes] == [second["id"], first["id"]]
    assert [r["is_primary"] for r in resumes] == [True, False]

    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["personal_information"]["full_name"] == "Priya Raman"

    imported = await client.post(f"/api/v1/profile/import/{second['id']}", headers=headers)
    assert imported.status_code == 200
    assert imported.json()["personal_information"]["full_name"] == "John Smith"
    assert imported.json()["source_resume_id"] == second["id"]


async def test_duplicate_upload_is_rejected(client: AsyncClient):
    headers = await auth_headers(client)
    data = make_pdf(ENGINEER)
    first = await upload(client, headers, "a.pdf", data)
    again = await upload(client, headers, "renamed.pdf", data)
    assert again.status_code == 409
    assert again.json()["error"]["details"]["resume_id"] == first.json()["id"]


async def test_invalid_uploads(client: AsyncClient):
    headers = await auth_headers(client)
    exe = await upload(client, headers, "virus.exe", b"MZ\x90\x00", "application/octet-stream")
    assert exe.status_code == 422
    assert exe.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"

    fake = await upload(client, headers, "cv.pdf", b"PK\x03\x04 not a pdf")
    assert fake.json()["error"]["code"] == "UNSUPPORTED_FILE_TYPE"

    big = await upload(client, headers, "big.pdf", b"%PDF-" + b"0" * (10 * 1024 * 1024 + 10))
    assert big.status_code == 422
    assert big.json()["error"]["code"] == "FILE_TOO_LARGE"


async def test_processing_failures_are_reported(client: AsyncClient):
    headers = await auth_headers(client)
    locked = (await upload(client, headers, "locked.pdf", encrypt_pdf(make_pdf(ENGINEER)))).json()
    blank = (await upload(client, headers, "scan.pdf", blank_pdf())).json()
    locked_status = (
        await client.get(f"/api/v1/resumes/{locked['id']}/status", headers=headers)
    ).json()
    blank_status = (
        await client.get(f"/api/v1/resumes/{blank['id']}/status", headers=headers)
    ).json()
    assert (locked_status["status"], locked_status["error_code"]) == (
        "failed",
        "PASSWORD_PROTECTED",
    )
    assert (blank_status["status"], blank_status["error_code"]) == ("failed", "NO_TEXT_FOUND")
    assert "password" in locked_status["error_message"].lower()

    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["personal_information"]["full_name"] is None


async def test_reprocess_and_download_and_delete(client: AsyncClient):
    headers = await auth_headers(client)
    data = make_pdf(ENGINEER)
    resume = (await upload(client, headers, "cv.pdf", data)).json()

    again = await client.post(f"/api/v1/resumes/{resume['id']}/process", headers=headers)
    assert again.status_code == 202
    status = (await client.get(f"/api/v1/resumes/{resume['id']}/status", headers=headers)).json()
    assert status["status"] == "ready"

    file = await client.get(f"/api/v1/resumes/{resume['id']}/file", headers=headers)
    assert file.status_code == 200
    assert file.content == data
    assert file.headers["content-type"] == "application/pdf"
    assert file.headers["x-content-type-options"] == "nosniff"

    deleted = await client.delete(f"/api/v1/resumes/{resume['id']}", headers=headers)
    assert deleted.status_code == 204
    missing = await client.get(f"/api/v1/resumes/{resume['id']}", headers=headers)
    assert missing.status_code == 404
    # The profile survives deletion of its source resume.
    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["personal_information"]["full_name"] == "Priya Raman"
    assert profile["source_resume_id"] is None


async def test_users_cannot_access_each_others_resumes(client: AsyncClient):
    alice = await auth_headers(client, "alice@example.com")
    resume = (await upload(client, alice, "a.pdf", make_pdf(ENGINEER))).json()
    bob = await auth_headers(client, "bob@example.com")
    for method, path in [
        ("GET", f"/api/v1/resumes/{resume['id']}"),
        ("GET", f"/api/v1/resumes/{resume['id']}/file"),
        ("GET", f"/api/v1/resumes/{resume['id']}/status"),
        ("POST", f"/api/v1/resumes/{resume['id']}/process"),
        ("DELETE", f"/api/v1/resumes/{resume['id']}"),
        ("POST", f"/api/v1/profile/import/{resume['id']}"),
    ]:
        response = await client.request(method, path, headers=bob)
        assert response.status_code == 404, (method, path)
    assert (await client.get("/api/v1/resumes", headers=bob)).json() == []


async def test_resume_endpoints_require_auth(client: AsyncClient):
    assert (await client.get("/api/v1/resumes")).status_code == 401
    assert (await client.get(f"/api/v1/resumes/{uuid.uuid4()}")).status_code == 401
