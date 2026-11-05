import uuid
from datetime import date

from httpx import AsyncClient

from app.services.applications import normalize_job_url
from tests.conftest import auth_headers
from tests.fixtures.documents import make_pdf
from tests.fixtures.sample_resumes import ENGINEER

JOB = "https://boards.greenhouse.io/acme/jobs/123"


def test_normalize_job_url():
    assert (
        normalize_job_url("https://Boards.Greenhouse.io/acme/jobs/123/?gh_src=abc&utm_source=x#app")
        == JOB
    )
    assert (
        normalize_job_url("https://x.myworkdayjobs.com/a/job/b/apply?q=1")
        == "https://x.myworkdayjobs.com/a/job/b/apply?q=1"
    )


async def detect(client, headers, **extra):
    payload = {
        "job_url": JOB,
        "company_name": "Acme",
        "job_title": "Engineer",
        "portal": "greenhouse",
        **extra,
    }
    return await client.post("/api/v1/extension/detect-job", headers=headers, json=payload)


async def test_detection_is_idempotent_and_only_moves_forward(client: AsyncClient):
    headers = await auth_headers(client)
    await client.post(
        "/api/v1/resumes/upload",
        headers=headers,
        files={"file": ("cv.pdf", make_pdf(ENGINEER), "application/pdf")},
    )

    first = (await detect(client, headers, fields_detected=9)).json()
    assert first["status"] == "detected"
    assert first["resume_id"] is not None  # the resume version in use is recorded
    again = (await detect(client, headers, job_url=JOB + "?utm_source=linkedin")).json()
    assert again["id"] == first["id"]
    assert again["fields_detected"] == 9

    filled = (await detect(client, headers, fields_filled=7)).json()
    assert filled["status"] == "in_progress"
    assert [e["status"] for e in filled["status_history"]] == ["detected", "in_progress"]

    # The user marks it submitted; later detections never move it back.
    patched = await client.patch(
        f"/api/v1/applications/{first['id']}", headers=headers, json={"status": "submitted"}
    )
    assert patched.json()["status"] == "submitted"
    assert patched.json()["applied_at"] is not None
    after = (await detect(client, headers, fields_filled=9)).json()
    assert after["status"] == "submitted"


async def test_detection_never_overwrites_user_edits(client: AsyncClient):
    headers = await auth_headers(client)
    created = (await detect(client, headers)).json()
    await client.patch(
        f"/api/v1/applications/{created['id']}", headers=headers, json={"company_name": "Acme Inc."}
    )
    again = (
        await detect(client, headers, company_name="ACME", job_description="Build things")
    ).json()
    assert again["company_name"] == "Acme Inc."
    assert again["job_description"] == "Build things"


async def test_manual_crud_filters_and_detail(client: AsyncClient):
    headers = await auth_headers(client)
    created = await client.post(
        "/api/v1/applications",
        headers=headers,
        json={
            "job_url": "https://jobs.lever.co/globex/abc",
            "company_name": "Globex",
            "job_title": "Designer",
            "status": "submitted",
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["source"] == "manual" and body["applied_at"] is not None
    duplicate = await client.post(
        "/api/v1/applications",
        headers=headers,
        json={"job_url": "https://jobs.lever.co/globex/abc/"},
    )
    assert duplicate.status_code == 409

    await detect(client, headers)
    assert len((await client.get("/api/v1/applications", headers=headers)).json()) == 2
    assert [
        a["company_name"]
        for a in (await client.get("/api/v1/applications?status=submitted", headers=headers)).json()
    ] == ["Globex"]
    assert [
        a["company_name"]
        for a in (await client.get("/api/v1/applications?q=acm", headers=headers)).json()
    ] == ["Acme"]

    detail = (await client.get(f"/api/v1/applications/{body['id']}", headers=headers)).json()
    assert detail["answers"] == [] and detail["resume_file_name"] is None

    notes = await client.patch(
        f"/api/v1/applications/{body['id']}",
        headers=headers,
        json={"notes": "Recruiter: Sam", "status": "interview"},
    )
    assert notes.json()["notes"] == "Recruiter: Sam"
    assert [e["status"] for e in notes.json()["status_history"]] == ["submitted", "interview"]
    bad = await client.patch(
        f"/api/v1/applications/{body['id']}", headers=headers, json={"status": "hired"}
    )
    assert bad.status_code == 422

    assert (
        await client.delete(f"/api/v1/applications/{body['id']}", headers=headers)
    ).status_code == 204
    assert (
        await client.get(f"/api/v1/applications/{body['id']}", headers=headers)
    ).status_code == 404


async def test_answer_usage_links_to_application(client: AsyncClient):
    headers = await auth_headers(client)
    application = (await detect(client, headers)).json()
    usage = await client.post(
        "/api/v1/answers/usages",
        headers=headers,
        json={
            "application_id": application["id"],
            "question_text": "Why Acme?",
            "final_answer": "Because.",
            "source": "manual",
        },
    )
    assert usage.json()["application_id"] == application["id"]
    detail = (await client.get(f"/api/v1/applications/{application['id']}", headers=headers)).json()
    assert [a["question_text"] for a in detail["answers"]] == ["Why Acme?"]


async def test_stats(client: AsyncClient):
    headers = await auth_headers(client)
    for i, status in enumerate(
        ["in_progress", "submitted", "interview", "rejected", "offer", "detected"]
    ):
        await client.post(
            "/api/v1/applications",
            headers=headers,
            json={"job_url": f"https://example.com/jobs/{i}", "status": status},
        )
    stats = (await client.get("/api/v1/applications/stats", headers=headers)).json()
    assert stats["total"] == 6
    assert stats["active"] == 2
    assert stats["submitted"] == 4
    assert stats["responses"] == 3
    assert stats["response_rate"] == 0.75
    assert stats["this_week"] == 6
    assert len(stats["weekly"]) == 8
    assert date.fromisoformat(stats["weekly"][-1]["week_start"]).weekday() == 0


async def test_applications_are_private(client: AsyncClient):
    alice = await auth_headers(client, "alice@example.com")
    application = (await detect(client, alice)).json()
    bob = await auth_headers(client, "bob@example.com")
    assert (await client.get("/api/v1/applications", headers=bob)).json() == []
    assert (
        await client.get(f"/api/v1/applications/{application['id']}", headers=bob)
    ).status_code == 404
    assert (
        await client.patch(
            f"/api/v1/applications/{application['id']}", headers=bob, json={"status": "offer"}
        )
    ).status_code == 404
    # Bob's usage cannot be attached to Alice's application.
    usage = await client.post(
        "/api/v1/answers/usages",
        headers=bob,
        json={
            "application_id": application["id"],
            "question_text": "Q",
            "final_answer": "A",
            "source": "manual",
        },
    )
    assert usage.json()["application_id"] is None
    assert (
        await client.get(f"/api/v1/applications/{uuid.uuid4()}", headers=bob)
    ).status_code == 404
