from httpx import AsyncClient

from tests.conftest import auth_headers


async def test_empty_profile_is_created_on_first_read(client: AsyncClient):
    headers = await auth_headers(client)
    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["personal_information"]["email"] is None
    assert profile["experience"] == []
    assert profile["completion"]["percentage"] == 0
    assert profile["completion"]["sections"]["experience"] == "missing"


async def test_put_replaces_profile_and_confirms(client: AsyncClient):
    headers = await auth_headers(client)
    payload = {
        "personal_information": {
            "full_name": "Jane Doe",
            "first_name": "Jane",
            "last_name": "Doe",
            "email": "Jane@Example.com",
            "phone": "+14155550134",
            "location": "Austin, TX",
        },
        "professional_summary": {"current_designation": "Engineer", "summary": "Hi"},
        "experience": [
            {
                "company_name": "Contoso",
                "designation": "Engineer",
                "start_date": "2020-01",
                "is_current": True,
                "responsibilities": ["Built things"],
                "is_confirmed": True,
            },
        ],
        "education": [{"degree": "BSc", "institution": "MIT", "graduation_year": 2019}],
        "skills": {"programming_languages": ["Python"]},
        "additional_info": {"notice_period": "30 days", "willing_to_relocate": True},
        "field_meta": {"personal_information.email": {"confidence": 1, "is_confirmed": True}},
    }
    response = await client.put("/api/v1/profile", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["personal_information"]["email"] == "jane@example.com"
    assert body["experience"][0]["company_name"] == "Contoso"
    assert body["experience"][0]["is_confirmed"] is True
    assert body["additional_info"]["notice_period"] == "30 days"
    completion = body["completion"]
    assert completion["sections"]["contact"] == "complete"
    assert completion["sections"]["additional"] == "complete"
    assert completion["sections"]["resume"] == "missing"
    assert completion["percentage"] == 85  # everything except LinkedIn (5) and resume (10)

    # Replacing again with fewer items deletes the rest.
    payload["experience"] = []
    body = (await client.put("/api/v1/profile", headers=headers, json=payload)).json()
    assert body["experience"] == []


async def test_patch_merges_sections(client: AsyncClient):
    headers = await auth_headers(client)
    await client.patch(
        "/api/v1/profile",
        headers=headers,
        json={"personal_information": {"full_name": "Jane Doe", "email": "jane@example.com"}},
    )
    body = (
        await client.patch(
            "/api/v1/profile",
            headers=headers,
            json={"personal_information": {"phone": "+14155550134"}, "skills": {"tools": ["Git"]}},
        )
    ).json()
    assert body["personal_information"]["full_name"] == "Jane Doe"
    assert body["personal_information"]["phone"] == "+14155550134"
    assert body["skills"]["tools"] == ["Git"]

    completion = (await client.get("/api/v1/profile/completion", headers=headers)).json()
    assert completion["sections"]["contact"] == "complete"


async def test_profile_validation(client: AsyncClient):
    headers = await auth_headers(client)
    response = await client.put(
        "/api/v1/profile",
        headers=headers,
        json={"experience": [{"start_date": "January"}]},
    )
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"].startswith("experience.0.start_date")


async def test_profiles_are_isolated(client: AsyncClient):
    alice = await auth_headers(client, "alice@example.com")
    await client.patch(
        "/api/v1/profile", headers=alice, json={"personal_information": {"full_name": "Alice"}}
    )
    bob = await auth_headers(client, "bob@example.com")
    assert (await client.get("/api/v1/profile", headers=bob)).json()["personal_information"][
        "full_name"
    ] is None
