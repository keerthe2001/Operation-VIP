"""The full learner journey, success and failure paths, against a real Postgres."""

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.models import Topic
from tests.conftest import register


async def _answers(app) -> dict[str, dict]:  # type: ignore[no-untyped-def]
    async with app.state.db.sessionmaker() as s:
        return {t.slug: t.body for t in await s.scalars(select(Topic))}


def _right(q: dict):  # type: ignore[no-untyped-def]
    t = q["type"]
    if t in {"mcq", "predict", "multi", "debug", "fill"}:
        return q["answer"]
    if t == "order":
        return q["items"]
    if t == "tune":
        return 1.5
    raise AssertionError(t)


async def test_auth_flow(client: AsyncClient) -> None:
    me = await register(client, "auth@test.dev")
    assert me["profile"]["onboarded"] is False
    assert (await client.get("/api/me")).json()["email"] == "auth@test.dev"
    dup = await client.post(
        "/api/auth/register",
        json={"name": "X", "email": "AUTH@test.dev", "password": "correct-horse-1"},
    )
    assert dup.status_code == 409
    await client.post("/api/auth/logout")
    assert (await client.get("/api/me")).status_code == 401
    bad = await client.post("/api/auth/login", json={"email": "auth@test.dev", "password": "nope"})
    assert bad.status_code == 401
    ok = await client.post(
        "/api/auth/login", json={"email": "auth@test.dev", "password": "correct-horse-1"}
    )
    assert ok.status_code == 200


async def test_short_password_and_csrf(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    r = await client.post(
        "/api/auth/register", json={"name": "A", "email": "s@test.dev", "password": "short"}
    )
    assert r.status_code == 422 and r.json()["detail"]["field"] == "password"
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as raw:
        r = await raw.post("/api/auth/login", json={"email": "a@b.co", "password": "x"})
        assert r.status_code == 403  # no client header: blocked as possible CSRF


async def test_password_reset(app, client: AsyncClient, caplog) -> None:  # type: ignore[no-untyped-def]
    await register(client, "reset@test.dev")
    with caplog.at_level("WARNING"):
        r = await client.post("/api/auth/forgot", json={"email": "reset@test.dev"})
    assert r.status_code == 200
    token = next(
        rec.getMessage().split("token=")[1]
        for rec in caplog.records
        if "token=" in rec.getMessage()
    )
    r = await client.post("/api/auth/reset", json={"token": token, "password": "brand-new-pass-1"})
    assert r.status_code == 200
    again = await client.post("/api/auth/reset", json={"token": token, "password": "x" * 12})
    assert again.status_code == 400
    unknown = await client.post("/api/auth/forgot", json={"email": "nobody@test.dev"})
    assert unknown.status_code == 200  # same answer, no account enumeration


async def test_onboarding_and_plan(client: AsyncClient) -> None:
    await register(client)
    r = await client.patch("/api/me", json={"complete_onboarding": True})
    assert r.status_code == 422
    r = await client.patch(
        "/api/me",
        json={"skill_level": "beginner", "time_budget": "30m", "complete_onboarding": True},
    )
    body = r.json()
    assert body["profile"]["onboarded"] and body["profile"]["explain_mode"] == "simple"
    state = (await client.get("/api/me/state")).json()
    assert state["plan"]["start"].startswith("Starter")
    assert state["next"]["kind"] == "watch" and state["levels"][0]["optional"]
    preview = (
        await client.get("/api/me/plan-preview", params={"skill": "advanced", "budget": "weekends"})
    ).json()
    assert "diagnostic" in preview["start"]


async def test_public_topic_hides_answers(client: AsyncClient) -> None:
    r = await client.get("/api/topics/tokens-and-tokenization")
    assert r.status_code == 200
    for q in r.json()["body"]["checks"]:
        assert "answer" not in q and "explain" not in q
    assert (await client.get("/api/topics/nope")).status_code == 404
    cur = (await client.get("/api/curriculum")).json()
    assert len(cur["levels"]) >= 3 and cur["levels"][0]["optional"]


async def test_answers_xp_and_locks(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    bodies = await _answers(app)
    await register(client)
    slug = "intro-to-llms"
    q = bodies[slug]["checks"][0]
    wrong = await client.post(
        f"/api/topics/{slug}/answer", json={"question_id": q["id"], "answer": (q["answer"] + 1) % 3}
    )
    assert wrong.json()["correct"] is False and wrong.json()["xp"] == 0
    right = await client.post(
        f"/api/topics/{slug}/answer", json={"question_id": q["id"], "answer": q["answer"]}
    )
    assert right.json()["correct"] and right.json()["xp"] == 5  # retry after a miss
    again = await client.post(
        f"/api/topics/{slug}/answer", json={"question_id": q["id"], "answer": q["answer"]}
    )
    assert again.json()["xp"] == 0  # evidence never pays twice

    locked_slug = "roles"
    lq = bodies[locked_slug]["checks"][0]
    r = await client.post(
        f"/api/topics/{locked_slug}/answer", json={"question_id": lq["id"], "answer": _right(lq)}
    )
    assert r.json()["correct"] and r.json()["locked"] and not r.json()["recorded"]


async def test_practised_needs_watch_and_all_checks(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    bodies = await _answers(app)
    await register(client)
    slug = "variables"
    for q in bodies[slug]["checks"]:
        await client.post(
            f"/api/topics/{slug}/answer", json={"question_id": q["id"], "answer": _right(q)}
        )
    t = (await client.get(f"/api/topics/{slug}")).json()
    assert t["progress"]["status"] != "practised"
    w = await client.post(f"/api/topics/{slug}/watched")
    assert w.json()["state"]["status"] == "practised"
    assert "first_scene" in w.json()["achievements"]
    rec = (await client.get("/api/me/record")).json()
    earned = {a["code"] for a in rec["achievements"] if a["earned_at"]}
    assert {"first_scene", "first_check", "first_topic"} <= earned


async def test_tune_is_graded_on_the_server(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    q = next(
        q for q in (await _answers(app))["inference-parameters"]["checks"] if q["type"] == "tune"
    )
    r = await client.post(
        "/api/topics/inference-parameters/answer", json={"question_id": q["id"], "answer": 1.0}
    )
    assert r.json()["correct"] is False
    r = await client.post(
        "/api/topics/inference-parameters/answer", json={"question_id": q["id"], "answer": 1.5}
    )
    assert r.json()["correct"] is True
    r = await client.post(
        "/api/topics/inference-parameters/answer",
        json={"question_id": q["id"], "answer": "nonsense"},
    )
    assert r.json()["correct"] is False


async def test_labs_and_events(client: AsyncClient) -> None:
    await register(client)
    lab = (await client.get("/api/labs/lab-variables")).json()
    ids = [s["id"] for s in lab["body"]["steps"]]
    for i, sid in enumerate(ids):
        r = await client.post("/api/labs/lab-variables/steps", json={"step_id": sid, "code": "x"})
        assert r.json()["completed"] is (i == len(ids) - 1)
    assert r.json()["xp"] == 40 and "first_lab" in r.json()["achievements"]
    bad = await client.post("/api/labs/lab-variables/steps", json={"step_id": "nope"})
    assert bad.status_code == 404
    run = await client.post("/api/events", json={"kind": "code_run"})
    assert run.json()["achievements"] == ["first_code_run"]
    ex = await client.post(
        "/api/events", json={"kind": "code_exercise_passed", "topic": "variables"}
    )
    assert ex.json()["xp"] == 30
    none = await client.post(
        "/api/events", json={"kind": "code_exercise_passed", "topic": "how-llms-work"}
    )
    assert none.status_code == 400


async def test_diagnostic_tests_out(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    bodies = await _answers(app)
    await register(client)
    d = (await client.get("/api/levels/llm-foundations/diagnostic")).json()
    assert d["questions"] and all("answer" not in q for q in d["questions"])
    answers = {}
    for q in d["questions"]:
        full = next(x for x in bodies[q["topic"]]["checks"] if x["id"] == q["id"])
        answers[f"{q['topic']}:{q['id']}"] = _right(full)
    r = (
        await client.post("/api/levels/llm-foundations/diagnostic", json={"answers": answers})
    ).json()
    assert r["passed"] and r["score"] == 100
    state = (await client.get("/api/me/state")).json()
    l1 = next(lv for lv in state["levels"] if lv["number"] == 1)
    l2 = next(lv for lv in state["levels"] if lv["number"] == 2)
    assert l1["complete"] and l2["unlocked"]


async def test_full_journey_to_certificate(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    bodies = await _answers(app)
    await register(client, name="Priya Raman")
    await client.patch(
        "/api/me",
        json={"skill_level": "intermediate", "time_budget": "1h", "complete_onboarding": True},
    )
    assert (await client.post("/api/certificates/claim")).status_code == 403

    state = (await client.get("/api/me/state")).json()
    for lv in [x for x in state["levels"] if not x["optional"]]:
        for t in lv["topics"]:
            await client.post(f"/api/topics/{t['slug']}/watched")
            for q in bodies[t["slug"]]["checks"]:
                r = await client.post(
                    f"/api/topics/{t['slug']}/answer",
                    json={"question_id": q["id"], "answer": _right(q)},
                )
                assert r.json()["correct"] and r.json()["recorded"], (t["slug"], q["id"])
        if lv["mission"]:
            bad = await client.post(
                f"/api/projects/{lv['mission']['slug']}/submissions",
                json={"repo_url": "http://evil.example/x"},
            )
            assert bad.status_code == 422
            r = await client.post(
                f"/api/projects/{lv['mission']['slug']}/submissions",
                json={"repo_url": "https://github.com/priya/project", "notes": "done"},
            )
            assert r.status_code == 201, r.text
            dup = await client.post(
                f"/api/projects/{lv['mission']['slug']}/submissions",
                json={"repo_url": "https://github.com/priya/project"},
            )
            assert dup.status_code == 409

    state = (await client.get("/api/me/state")).json()
    assert state["totals"]["percent"] == 100 and not state["certificate"]["eligible"]
    assert state["next"] is None or state["next"]["kind"] != "certificate"

    # An admin reviews every mission against its rubric.
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers={"X-HX-Client": "web"}
    ) as admin:
        await register(admin, "admin@test.dev", name="Admin")
        assert (await client.get("/api/admin/submissions")).status_code == 403
        queue = (await admin.get("/api/admin/submissions")).json()
        mine = [s for s in queue if s["learner"] == "Priya Raman"]
        assert mine
        first = mine[0]
        low = {c["name"]: 0 for c in first["rubric"]}
        r = await admin.post(
            f"/api/admin/submissions/{first['id']}/review",
            json={"scores": low, "feedback": "Needs tests."},
        )
        assert r.json()["status"] == "needs_work"
        # Resubmit after feedback, then pass everything.
        r = await client.post(
            f"/api/projects/{first['project_slug']}/submissions",
            json={"repo_url": "https://github.com/priya/project-v2"},
        )
        assert r.status_code == 201
        for sub in [
            s
            for s in (await admin.get("/api/admin/submissions")).json()
            if s["learner"] == "Priya Raman"
        ]:
            full = {c["name"]: c["points"] for c in sub["rubric"]}
            over = dict(full, **{sub["rubric"][0]["name"]: 999})
            bad = await admin.post(
                f"/api/admin/submissions/{sub['id']}/review", json={"scores": over, "feedback": "x"}
            )
            assert bad.status_code == 422
            r = await admin.post(
                f"/api/admin/submissions/{sub['id']}/review",
                json={"scores": full, "feedback": "Great work."},
            )
            assert r.json()["status"] == "passed"
        audit = (await admin.get("/api/admin/audit")).json()
        assert any(a["action"] == "submission.review" for a in audit)

    state = (await client.get("/api/me/state")).json()
    assert state["certificate"]["eligible"] and state["next"]["kind"] == "certificate"
    cert = (await client.post("/api/certificates/claim")).json()
    assert cert["code"].startswith("HX-AAE-") and cert["name"] == "Priya Raman"
    assert (await client.post("/api/certificates/claim")).json()["code"] == cert["code"]
    public = await client.get(f"/api/certificates/{cert['code'].lower()}")
    assert public.status_code == 200 and public.json()["name"] == "Priya Raman"
    assert (await client.get("/api/certificates/HX-AAE-2000-00000")).status_code == 404


async def test_admin_content_publish_and_validation(app, client: AsyncClient) -> None:  # type: ignore[no-untyped-def]
    await register(client, "admin2@test.dev")
    assert (await client.get("/api/admin/overview")).status_code == 403
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers={"X-HX-Client": "web"}
    ) as admin:
        await admin.post(
            "/api/auth/login", json={"email": "admin@test.dev", "password": "correct-horse-1"}
        )
        if (await admin.get("/api/me")).status_code != 200:
            await register(admin, "admin@test.dev", name="Admin")
        rows = (await admin.get("/api/admin/content", params={"kind": "topic"})).json()
        row = next(r for r in rows if r["slug"] == "model-selection")
        doc = (await admin.get(f"/api/admin/content/topic/{row['id']}")).json()
        broken = dict(
            doc["body"],
            scenes=[
                {
                    "engine": "nope",
                    "title": "x",
                    "track": ["a", "b"],
                    "steps": [{"at": 0, "caption": "c"}, {"at": 1, "caption": "d"}],
                }
            ],
        )
        r = await admin.put(
            f"/api/admin/content/topic/{row['id']}",
            json={"title": doc["title"], "status": "published", "body": broken},
        )
        assert r.status_code == 422 and "engine" in r.json()["detail"]["message"]
        r = await admin.put(
            f"/api/admin/content/topic/{row['id']}",
            json={"title": doc["title"], "status": "draft", "body": doc["body"]},
        )
        assert r.status_code == 200
        assert (await client.get("/api/topics/model-selection")).status_code == 404
        await admin.put(
            f"/api/admin/content/topic/{row['id']}",
            json={"title": doc["title"], "status": "published", "body": doc["body"]},
        )
        assert (await client.get("/api/topics/model-selection")).status_code == 200

        ads = (await admin.get("/api/admin/ads")).json()
        assert {a["placement"] for a in ads} >= {"homepage_banner", "article_inline"}
        await admin.put("/api/admin/ads/homepage_banner", json={"enabled": True})
        cfg = (await client.get("/api/public/config")).json()
        # No publisher ID configured, so ads stay off even when a placement is enabled.
        assert cfg["placements"]["homepage_banner"]["enabled"] is False
