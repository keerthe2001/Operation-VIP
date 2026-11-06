import uuid

from httpx import AsyncClient

from tests.conftest import auth_headers

ANSWER = {
    "category": "why_company",
    "question_text": "Why do you want to work here?",
    "answer_template": "I admire {company} because of its products.",
    "variants": ["Short: I like {company}.", "  ", ""],
}


async def test_crud_and_validation(client: AsyncClient):
    headers = await auth_headers(client)
    created = await client.post("/api/v1/answers", headers=headers, json=ANSWER)
    assert created.status_code == 201
    body = created.json()
    assert body["variants"] == ["Short: I like {company}."]
    assert body["usage_count"] == 0

    listed = (await client.get("/api/v1/answers", headers=headers)).json()
    assert [a["id"] for a in listed] == [body["id"]]

    patched = await client.patch(
        f"/api/v1/answers/{body['id']}", headers=headers, json={"answer_template": "Updated"}
    )
    assert patched.json()["answer_template"] == "Updated"
    assert patched.json()["question_text"] == ANSWER["question_text"]

    bad = await client.post("/api/v1/answers", headers=headers, json={**ANSWER, "category": "nope"})
    assert bad.status_code == 422

    deleted = await client.delete(f"/api/v1/answers/{body['id']}", headers=headers)
    assert deleted.status_code == 204
    assert (await client.get("/api/v1/answers", headers=headers)).json() == []


async def test_templates_and_placeholders(client: AsyncClient):
    headers = await auth_headers(client)
    templates = (await client.get("/api/v1/answers/templates", headers=headers)).json()
    assert len(templates) >= 8
    placeholders = (await client.get("/api/v1/answers/placeholders", headers=headers)).json()
    # Every placeholder used by a starter template is a known placeholder.
    import re

    for template in templates:
        for text in [template["answer_template"], *template["variants"]]:
            for name in re.findall(r"\{(\w+)\}", text):
                assert name in placeholders


async def test_usage_is_recorded_and_counted(client: AsyncClient):
    headers = await auth_headers(client)
    answer = (await client.post("/api/v1/answers", headers=headers, json=ANSWER)).json()
    usage = await client.post(
        "/api/v1/answers/usages",
        headers=headers,
        json={
            "saved_answer_id": answer["id"],
            "question_text": "Why Acme?",
            "final_answer": "I admire Acme because of its products.",
            "company": "Acme",
            "job_title": "Engineer",
            "url": "https://boards.greenhouse.io/acme/jobs/1",
        },
    )
    assert usage.status_code == 201
    listed = (await client.get("/api/v1/answers", headers=headers)).json()
    assert listed[0]["usage_count"] == 1

    manual = await client.post(
        "/api/v1/answers/usages",
        headers=headers,
        json={"question_text": "Q", "final_answer": "A", "source": "manual"},
    )
    assert manual.status_code == 201


async def test_answers_are_private(client: AsyncClient):
    alice = await auth_headers(client, "alice@example.com")
    answer = (await client.post("/api/v1/answers", headers=alice, json=ANSWER)).json()
    bob = await auth_headers(client, "bob@example.com")
    assert (await client.get("/api/v1/answers", headers=bob)).json() == []
    assert (
        await client.patch(f"/api/v1/answers/{answer['id']}", headers=bob, json={})
    ).status_code == 404
    assert (await client.delete(f"/api/v1/answers/{answer['id']}", headers=bob)).status_code == 404
    usage = await client.post(
        "/api/v1/answers/usages",
        headers=bob,
        json={"saved_answer_id": answer["id"], "question_text": "Q", "final_answer": "A"},
    )
    assert usage.status_code == 404
    assert (await client.delete(f"/api/v1/answers/{uuid.uuid4()}", headers=bob)).status_code == 404


async def test_extension_profile_includes_answers_and_etag_changes(client: AsyncClient):
    headers = await auth_headers(client)
    first = await client.get("/api/v1/extension/profile", headers=headers)
    assert first.json()["answers"] == []
    await client.post("/api/v1/answers", headers=headers, json=ANSWER)
    again = await client.get(
        "/api/v1/extension/profile", headers={**headers, "If-None-Match": first.headers["etag"]}
    )
    assert again.status_code == 200
    assert again.json()["answers"][0]["category"] == "why_company"


def test_starter_templates_need_no_manual_editing():
    import re

    from app.services.answer_templates import PLACEHOLDERS, STARTER_TEMPLATES

    for template in STARTER_TEMPLATES:
        for text in [template.answer_template, *template.variants]:
            assert "[" not in text, text  # nothing for the user to fill in by hand
            for name, fallback in re.findall(r"\{(\w+)(?:\|([^{}]*))?\}", text):
                assert name in PLACEHOLDERS, name
                assert fallback, f"{{{name}}} needs a fallback in: {text}"
