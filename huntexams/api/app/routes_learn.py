"""Curriculum reading (public) and learning evidence (signed in)."""

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.content import grade, public_lab_body, public_question, public_topic_body
from app.core import api_error, not_found, rate_limit
from app.deps import CurrentUser, DbDep, OptionalUser
from app.learning import (
    ACHIEVEMENTS,
    award,
    grant,
    learner_state,
    log_activity,
    published_levels,
    published_path,
    today_for,
    topic_state,
)
from app.models import (
    Activity,
    Lab,
    LabProgress,
    Level,
    Project,
    PublishStatus,
    StudentAchievement,
    Topic,
    TopicProgress,
    User,
    XpTransaction,
)
from app.models import Attempt as AttemptRow

router = APIRouter(tags=["learn"])


def _writes(request: Request) -> int:
    return request.app.state.settings.rate_limit_writes_per_minute


WriteLimit = Depends(rate_limit("writes", _writes))


def _tz(request: Request) -> str | None:
    return request.headers.get("x-timezone")


async def _published_topic(db, slug: str) -> Topic:  # type: ignore[no-untyped-def]
    topic = await db.scalar(select(Topic).where(Topic.slug == slug))
    if not topic or topic.status != PublishStatus.PUBLISHED:
        raise not_found("That lesson doesn't exist.")
    level = await db.get(Level, topic.level_id)
    if not level or level.status != PublishStatus.PUBLISHED:
        raise not_found("That lesson doesn't exist.")
    return topic


async def _progress(db, user: User, topic: Topic) -> TopicProgress:  # type: ignore[no-untyped-def]
    tp = await db.get(TopicProgress, (user.id, topic.id))
    if not tp:
        tp = TopicProgress(user_id=user.id, topic_id=topic.id, checks_passed=[])
        db.add(tp)
    return tp


async def _level_unlocked(db, user: User, level_id: int) -> bool:  # type: ignore[no-untyped-def]
    state = await learner_state(db, user)
    level = await db.get(Level, level_id)
    return any(lv["number"] == level.number and lv["unlocked"] for lv in state["levels"])


async def _maybe_practised(db, user: User, topic: Topic, tp: TopicProgress, day) -> int:  # type: ignore[no-untyped-def]
    """Mark the topic practised once it is watched and every check has been passed."""
    if tp.practised_at or not tp.watched_at:
        return 0
    ids = {q["id"] for q in topic.body.get("checks", [])}
    if not ids.issubset(set(tp.checks_passed or [])):
        return 0
    tp.practised_at = datetime.now(UTC)
    gained = await award(db, user.id, "topic_practised", topic.slug)
    await grant(db, user.id, "first_topic")
    await log_activity(db, user.id, day, "topic", f"Practised: {topic.title}", 0)
    return gained


# ---------------------------------------------------------------- public reading


@router.get("/curriculum")
async def curriculum(db: DbDep) -> dict[str, Any]:
    path = await published_path(db)
    if not path:
        raise not_found("No career path is published yet.")
    levels = await published_levels(db, path.id)
    projects = {
        p.level_id: p
        for p in await db.scalars(select(Project).where(Project.status == PublishStatus.PUBLISHED))
    }
    labs = {
        lab.topic_id: lab.slug
        for lab in await db.scalars(select(Lab).where(Lab.status == PublishStatus.PUBLISHED))
    }
    return {
        "path": {"slug": path.slug, "title": path.title, "summary": path.summary},
        "levels": [
            {
                "number": lv.number,
                "slug": lv.slug,
                "title": lv.title,
                "summary": lv.summary,
                "hours": lv.hours,
                "optional": lv.optional,
                "mission": (
                    {"slug": projects[lv.id].slug, "title": projects[lv.id].title}
                    if lv.id in projects
                    else None
                ),
                "topics": [
                    {
                        "slug": t.slug,
                        "number": t.number,
                        "title": t.title,
                        "summary": t.summary,
                        "minutes": t.minutes,
                        "engine": (t.body.get("scenes") or [{}])[0].get("engine"),
                        "practice": sorted({q["type"] for q in t.body.get("checks", [])}),
                        "has_code": bool(t.body.get("code")),
                        "lab": labs.get(t.id),
                    }
                    for t in lv.__dict__["published_topics"]
                ],
            }
            for lv in levels
        ],
    }


@router.get("/topics/{slug}")
async def get_topic(slug: str, db: DbDep, user: OptionalUser) -> dict[str, Any]:
    topic = await _published_topic(db, slug)
    level = await db.get(Level, topic.level_id)
    siblings = [t for t in level.topics if t.status == PublishStatus.PUBLISHED]
    idx = next(i for i, t in enumerate(siblings) if t.id == topic.id)
    lab = await db.scalar(
        select(Lab).where(Lab.topic_id == topic.id, Lab.status == PublishStatus.PUBLISHED)
    )
    out: dict[str, Any] = {
        "slug": topic.slug,
        "title": topic.title,
        "summary": topic.summary,
        "minutes": topic.minutes,
        "number": topic.number,
        "count": len(siblings),
        "level": {"number": level.number, "slug": level.slug, "title": level.title},
        "body": public_topic_body(topic.body),
        "lab": {"slug": lab.slug, "title": lab.title} if lab else None,
        "prev": siblings[idx - 1].slug if idx > 0 else None,
        "next": siblings[idx + 1].slug if idx + 1 < len(siblings) else None,
        "outline": [{"slug": t.slug, "title": t.title} for t in siblings],
        "progress": None,
    }
    if user:
        tp = await db.get(TopicProgress, (user.id, topic.id))
        out["progress"] = topic_state(tp, topic) | {
            "passed_ids": list(tp.checks_passed) if tp else [],
            "unlocked": await _level_unlocked(db, user, topic.level_id),
        }
    return out


# ---------------------------------------------------------------- evidence


@router.post("/topics/{slug}/watched", dependencies=[WriteLimit])
async def watched(slug: str, request: Request, db: DbDep, user: CurrentUser) -> dict:
    topic = await _published_topic(db, slug)
    tp = await _progress(db, user, topic)
    day = today_for(_tz(request))
    gained, new = 0, []
    if not tp.watched_at:
        tp.watched_at = datetime.now(UTC)
        gained += await award(db, user.id, "scene_watched", topic.slug)
        await log_activity(
            db, user.id, day, "scene", f"Watched: {topic.title}", max(2, topic.minutes // 2)
        )
        if await grant(db, user.id, "first_scene"):
            new.append("first_scene")
        gained += await _maybe_practised(db, user, topic, tp, day)
    await db.commit()
    return {"xp": gained, "achievements": new, "state": topic_state(tp, topic)}


class AnswerIn(BaseModel):
    question_id: str = Field(max_length=64)
    answer: Any


@router.post("/topics/{slug}/answer", dependencies=[WriteLimit])
async def answer(
    slug: str, body: AnswerIn, request: Request, db: DbDep, user: OptionalUser
) -> dict:
    topic = await _published_topic(db, slug)
    q = next((q for q in topic.body.get("checks", []) if q["id"] == body.question_id), None)
    if not q:
        raise not_found("That question doesn't exist.")
    correct = grade(q, body.answer)
    out: dict[str, Any] = {
        "correct": correct,
        "explain": q.get("explain", "") if correct else "",
        "hint": "" if correct else q.get("hint", ""),
        "xp": 0,
        "recorded": False,
        "locked": False,
        "achievements": [],
    }
    if not user:
        return out
    if not await _level_unlocked(db, user, topic.level_id):
        out["locked"] = True
        return out
    day = today_for(_tz(request))
    tp = await _progress(db, user, topic)
    tries = len(
        list(
            await db.scalars(
                select(AttemptRow.id).where(
                    AttemptRow.user_id == user.id,
                    AttemptRow.topic_id == topic.id,
                    AttemptRow.question_id == q["id"],
                )
            )
        )
    )
    db.add(AttemptRow(user_id=user.id, topic_id=topic.id, question_id=q["id"], correct=correct))
    if correct and q["id"] not in (tp.checks_passed or []):
        tp.checks_passed = [*(tp.checks_passed or []), q["id"]]
        reason = "check_first_try" if tries == 0 else "check_retry"
        out["xp"] += await award(db, user.id, reason, f"{topic.slug}:{q['id']}")
        await log_activity(db, user.id, day, "check", f"Answered: {topic.title}", 1)
        if await grant(db, user.id, "first_check"):
            out["achievements"].append("first_check")
        before = tp.practised_at
        out["xp"] += await _maybe_practised(db, user, topic, tp, day)
        if not before and tp.practised_at:
            out["achievements"].append("first_topic")
    await db.commit()
    out.update(recorded=True, state=topic_state(tp, topic))
    return out


class EventIn(BaseModel):
    kind: Literal["code_run", "code_exercise_passed"]
    topic: str | None = Field(default=None, max_length=96)


@router.post("/events", dependencies=[WriteLimit])
async def event(body: EventIn, request: Request, db: DbDep, user: CurrentUser) -> dict:
    day = today_for(_tz(request))
    out: dict[str, Any] = {"xp": 0, "achievements": []}
    if body.kind == "code_run":
        if await grant(db, user.id, "first_code_run"):
            out["achievements"].append("first_code_run")
            await log_activity(db, user.id, day, "code", "First code run in the sandbox", 1)
    elif body.kind == "code_exercise_passed" and body.topic:
        topic = await _published_topic(db, body.topic)
        if not topic.body.get("exercise"):
            raise api_error(400, "This lesson has no code exercise.", "no_exercise")
        # Tests run in the learner's browser sandbox, so this is self-reported evidence.
        # Missions (human-reviewed) carry the weight for certificates.
        out["xp"] = await award(db, user.id, "code_exercise_passed", topic.slug)
        if out["xp"]:
            await log_activity(db, user.id, day, "code", f"Code exercise: {topic.title}", 5)
    await db.commit()
    return out


# ---------------------------------------------------------------- labs


@router.get("/labs/{slug}")
async def get_lab(slug: str, db: DbDep, user: OptionalUser) -> dict:
    lab = await db.scalar(select(Lab).where(Lab.slug == slug))
    if not lab or lab.status != PublishStatus.PUBLISHED:
        raise not_found("That lab doesn't exist.")
    topic = await db.get(Topic, lab.topic_id) if lab.topic_id else None
    level = await db.get(Level, topic.level_id) if topic else None
    out: dict[str, Any] = {
        "slug": lab.slug,
        "title": lab.title,
        "body": public_lab_body(lab.body),
        "topic": {"slug": topic.slug, "title": topic.title} if topic else None,
        "level": {"number": level.number, "title": level.title} if level else None,
        "progress": None,
    }
    if user:
        lp = await db.get(LabProgress, (user.id, lab.id))
        out["progress"] = {
            "steps_done": lp.steps_done if lp else [],
            "code": lp.code if lp else {},
            "completed": bool(lp and lp.completed_at),
        }
    return out


class LabStepIn(BaseModel):
    step_id: str = Field(max_length=64)
    code: str | None = Field(default=None, max_length=20000)


@router.post("/labs/{slug}/steps", dependencies=[WriteLimit])
async def lab_step(
    slug: str, body: LabStepIn, request: Request, db: DbDep, user: CurrentUser
) -> dict:
    lab = await db.scalar(select(Lab).where(Lab.slug == slug))
    if not lab or lab.status != PublishStatus.PUBLISHED:
        raise not_found("That lab doesn't exist.")
    ids = [s["id"] for s in lab.body.get("steps", [])]
    if body.step_id not in ids:
        raise not_found("That step doesn't exist.")
    lp = await db.get(LabProgress, (user.id, lab.id))
    if not lp:
        lp = LabProgress(user_id=user.id, lab_id=lab.id, steps_done=[], code={})
        db.add(lp)
    if body.step_id not in (lp.steps_done or []):
        lp.steps_done = [*(lp.steps_done or []), body.step_id]
    if body.code is not None:
        lp.code = {**(lp.code or {}), body.step_id: body.code}
    out: dict[str, Any] = {"xp": 0, "achievements": [], "completed": bool(lp.completed_at)}
    if not lp.completed_at and set(ids).issubset(set(lp.steps_done)):
        lp.completed_at = datetime.now(UTC)
        out["xp"] = await award(db, user.id, "lab_completed", lab.slug)
        await log_activity(
            db,
            user.id,
            today_for(_tz(request)),
            "lab",
            f"Lab: {lab.title}",
            int(lab.body.get("minutes", 15)),
        )
        if await grant(db, user.id, "first_lab"):
            out["achievements"].append("first_lab")
        out["completed"] = True
    await db.commit()
    return out


# ---------------------------------------------------------------- dashboard data


@router.get("/me/state")
async def my_state(request: Request, db: DbDep, user: CurrentUser) -> dict:
    return await learner_state(db, user, today_for(_tz(request)))


@router.get("/me/record")
async def my_record(db: DbDep, user: CurrentUser) -> dict:
    earned = {
        a.code: a.earned_at
        for a in await db.scalars(
            select(StudentAchievement).where(StudentAchievement.user_id == user.id)
        )
    }
    recent = await db.scalars(
        select(Activity)
        .where(Activity.user_id == user.id)
        .order_by(Activity.created_at.desc())
        .limit(12)
    )
    ledger = await db.scalars(
        select(XpTransaction)
        .where(XpTransaction.user_id == user.id)
        .order_by(XpTransaction.created_at.desc())
        .limit(12)
    )
    return {
        "achievements": [
            {"code": c, **meta, "earned_at": earned.get(c)} for c, meta in ACHIEVEMENTS.items()
        ],
        "recent": [
            {"kind": a.kind, "label": a.label, "day": a.day, "at": a.created_at} for a in recent
        ],
        "xp_ledger": [
            {"reason": x.reason, "ref": x.ref, "amount": x.amount, "at": x.created_at}
            for x in ledger
        ],
    }


# ---------------------------------------------------------------- diagnostics

DIAG_TYPES = {"mcq", "multi", "order", "fill", "debug", "predict"}
DIAG_MAX = 8


async def _diag_questions(db, slug: str) -> tuple[Level, list[tuple[Topic, dict]]]:  # type: ignore[no-untyped-def]
    path = await published_path(db)
    level = (
        await db.scalar(select(Level).where(Level.slug == slug, Level.path_id == path.id))
        if path
        else None
    )
    if not level or level.optional or level.status != PublishStatus.PUBLISHED:
        raise not_found("No diagnostic for that level.")
    pool: list[tuple[Topic, dict]] = []
    topics = [t for t in level.topics if t.status == PublishStatus.PUBLISHED]
    for t in topics:  # one question per topic first, then fill up
        qs = [q for q in t.body.get("checks", []) if q["type"] in DIAG_TYPES]
        if qs:
            pool.append((t, qs[-1]))
    return level, pool[:DIAG_MAX]


@router.get("/levels/{slug}/diagnostic")
async def diagnostic(slug: str, db: DbDep, user: CurrentUser) -> dict:
    level, qs = await _diag_questions(db, slug)
    return {
        "level": {"number": level.number, "title": level.title},
        "pass_percent": 80,
        "questions": [{"topic": t.slug, **public_question(q)} for t, q in qs],
    }


class DiagIn(BaseModel):
    answers: dict[str, Any]


@router.post("/levels/{slug}/diagnostic", dependencies=[WriteLimit])
async def submit_diagnostic(
    slug: str, body: DiagIn, request: Request, db: DbDep, user: CurrentUser
) -> dict:
    level, qs = await _diag_questions(db, slug)
    if not qs:
        raise api_error(400, "This level has no diagnostic questions yet.", "empty")
    results = {
        f"{t.slug}:{q['id']}": grade(q, body.answers.get(f"{t.slug}:{q['id']}")) for t, q in qs
    }
    score = round(100 * sum(results.values()) / len(results))
    passed = score >= 80
    xp = 0
    if passed:
        for t in level.topics:
            if t.status != PublishStatus.PUBLISHED:
                continue
            tp = await _progress(db, user, t)
            tp.tested_out = True
            tp.practised_at = tp.practised_at or datetime.now(UTC)
        xp = await award(db, user.id, "diagnostic_passed", level.slug)
        await log_activity(
            db,
            user.id,
            today_for(_tz(request)),
            "diagnostic",
            f"Tested out of Level {level.number}",
            15,
        )
    await db.commit()
    return {"score": score, "passed": passed, "results": results, "xp": xp}
