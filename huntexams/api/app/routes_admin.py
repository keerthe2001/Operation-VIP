"""Admin: content editing with draft/publish, mission reviews, ads, users and the audit log."""

from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.content import validate_body
from app.core import api_error, not_found
from app.deps import AdminUser, DbDep
from app.learning import award, grant
from app.models import (
    AdPlacement,
    AuditLog,
    Guide,
    Lab,
    Level,
    Plan,
    Project,
    PublishStatus,
    Role,
    Submission,
    SubmissionStatus,
    Topic,
    User,
)

router = APIRouter(prefix="/admin", tags=["admin"])

KINDS: dict[str, Any] = {"topic": Topic, "lab": Lab, "project": Project, "guide": Guide}
LEVEL_ACHIEVEMENT = {4: "rag_builder", 5: "agent_developer"}


def _audit(db, actor: User, action: str, target: str, **detail: Any) -> None:  # type: ignore[no-untyped-def]
    db.add(AuditLog(actor_id=actor.id, action=action, target=target, detail=detail))


@router.get("/overview")
async def overview(db: DbDep, _: AdminUser) -> dict:
    async def count(model: Any, *where: Any) -> int:
        return int(await db.scalar(select(func.count()).select_from(model).where(*where)) or 0)

    return {
        "learners": await count(User, User.role == Role.STUDENT),
        "topics": await count(Topic),
        "topics_draft": await count(Topic, Topic.status == PublishStatus.DRAFT),
        "labs": await count(Lab),
        "projects": await count(Project),
        "to_review": await count(Submission, Submission.status == SubmissionStatus.SUBMITTED),
    }


@router.get("/content")
async def list_content(
    kind: Literal["topic", "lab", "project", "guide"], db: DbDep, _: AdminUser
) -> list[dict]:
    model = KINDS[kind]
    rows = list(await db.scalars(select(model).order_by(model.id)))
    levels = {lv.id: lv for lv in await db.scalars(select(Level))}
    out = []
    for r in rows:
        level_id = getattr(r, "level_id", None)
        out.append(
            {
                "id": r.id,
                "slug": r.slug,
                "title": r.title,
                "status": r.status.value,
                "version": getattr(r, "version", None),
                "level": levels[level_id].number if level_id in levels else None,
                "number": getattr(r, "number", None),
                "updated_at": r.updated_at,
            }
        )
    return out


@router.get("/content/{kind}/{item_id}")
async def get_content(
    kind: Literal["topic", "lab", "project", "guide"], item_id: int, db: DbDep, _: AdminUser
) -> dict:
    row = await db.get(KINDS[kind], item_id)
    if not row:
        raise not_found()
    return {
        "id": row.id,
        "slug": row.slug,
        "title": row.title,
        "status": row.status.value,
        "summary": getattr(row, "summary", None),
        "minutes": getattr(row, "minutes", None),
        "version": getattr(row, "version", None),
        "body": row.body,
    }


class ContentIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=2000)
    minutes: int | None = Field(default=None, ge=1, le=600)
    status: Literal["draft", "published"]
    body: dict[str, Any]


@router.put("/content/{kind}/{item_id}")
async def save_content(
    kind: Literal["topic", "lab", "project", "guide"],
    item_id: int,
    payload: ContentIn,
    db: DbDep,
    admin: AdminUser,
) -> dict:
    row = await db.get(KINDS[kind], item_id)
    if not row:
        raise not_found()
    try:
        validate_body(kind, payload.body)
    except ValueError as exc:
        raise api_error(422, str(exc), "invalid_content") from exc
    before = row.status.value
    row.title, row.body, row.status = payload.title, payload.body, PublishStatus(payload.status)
    if payload.summary is not None and hasattr(row, "summary"):
        row.summary = payload.summary
    if payload.minutes is not None and hasattr(row, "minutes"):
        row.minutes = payload.minutes
    if hasattr(row, "version"):
        row.version = (row.version or 1) + 1
    _audit(
        db,
        admin,
        "content.save",
        f"{kind}:{row.slug}",
        status_before=before,
        status_after=payload.status,
    )
    await db.commit()
    return {"ok": True, "status": row.status.value, "version": getattr(row, "version", None)}


@router.get("/submissions")
async def submissions(
    db: DbDep, _: AdminUser, status: Literal["submitted", "passed", "needs_work"] = "submitted"
) -> list:
    rows = await db.execute(
        select(Submission, User, Project)
        .join(User, User.id == Submission.user_id)
        .join(Project, Project.id == Submission.project_id)
        .where(Submission.status == SubmissionStatus(status))
        .order_by(Submission.created_at)
    )
    return [
        {
            "id": str(s.id),
            "learner": u.name,
            "email": u.email,
            "project": p.title,
            "project_slug": p.slug,
            "rubric": p.body.get("rubric", []),
            "pass_mark": p.body.get("pass_mark", 70),
            "repo_url": s.repo_url,
            "demo_url": s.demo_url,
            "notes": s.notes,
            "status": s.status.value,
            "score": s.score,
            "created_at": s.created_at,
        }
        for s, u, p in rows
    ]


class ReviewIn(BaseModel):
    scores: dict[str, int]
    feedback: str = Field(min_length=1, max_length=4000)


@router.post("/submissions/{sub_id}/review")
async def review(sub_id: str, payload: ReviewIn, db: DbDep, admin: AdminUser) -> dict:
    sub = await db.scalar(select(Submission).where(Submission.id == sub_id))
    if not sub:
        raise not_found()
    if sub.status != SubmissionStatus.SUBMITTED:
        raise api_error(409, "This submission was already reviewed.", "reviewed")
    project = await db.get(Project, sub.project_id)
    rubric = {c["name"]: int(c["points"]) for c in project.body.get("rubric", [])}
    if set(payload.scores) != set(rubric):
        raise api_error(422, "Score every rubric criterion.", "incomplete")
    for name, pts in payload.scores.items():
        if not 0 <= pts <= rubric[name]:
            raise api_error(422, f"'{name}' must be between 0 and {rubric[name]}.", "range")
    total = sum(payload.scores.values())
    passed = total >= int(project.body.get("pass_mark", 70))
    sub.rubric_scores, sub.score, sub.feedback = payload.scores, total, payload.feedback.strip()
    sub.status = SubmissionStatus.PASSED if passed else SubmissionStatus.NEEDS_WORK
    sub.reviewed_by, sub.reviewed_at = admin.id, datetime.now(UTC)
    if passed:
        await award(db, sub.user_id, "mission_passed", project.slug)
        level = await db.get(Level, project.level_id)
        if level and level.number in LEVEL_ACHIEVEMENT:
            await grant(db, sub.user_id, LEVEL_ACHIEVEMENT[level.number])
    _audit(db, admin, "submission.review", f"submission:{sub.id}", score=total, passed=passed)
    await db.commit()
    return {"status": sub.status.value, "score": total}


@router.get("/ads")
async def get_ads(db: DbDep, _: AdminUser) -> list[dict]:
    return [
        {"placement": p.placement, "enabled": p.enabled, "ad_unit_id": p.ad_unit_id}
        for p in await db.scalars(select(AdPlacement).order_by(AdPlacement.placement))
    ]


class AdIn(BaseModel):
    enabled: bool
    ad_unit_id: str | None = Field(default=None, max_length=64, pattern=r"^[0-9]*$")


@router.put("/ads/{placement}")
async def set_ad(placement: str, payload: AdIn, db: DbDep, admin: AdminUser) -> dict:
    row = await db.get(AdPlacement, placement)
    if not row:
        raise not_found()
    row.enabled, row.ad_unit_id = payload.enabled, payload.ad_unit_id or None
    _audit(db, admin, "ads.update", placement, enabled=payload.enabled)
    await db.commit()
    return {"placement": placement, "enabled": row.enabled}


@router.get("/users")
async def users(db: DbDep, _: AdminUser) -> list[dict]:
    rows = await db.scalars(select(User).order_by(User.created_at.desc()).limit(200))
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "role": u.role.value,
            "plan": u.plan.value,
            "created_at": u.created_at,
        }
        for u in rows
    ]


class UserIn(BaseModel):
    plan: Literal["free", "pro"]


@router.patch("/users/{user_id}")
async def set_plan(user_id: str, payload: UserIn, db: DbDep, admin: AdminUser) -> dict:
    user = await db.scalar(select(User).where(User.id == user_id))
    if not user:
        raise not_found()
    user.plan = Plan(payload.plan)
    _audit(db, admin, "user.plan", f"user:{user.email}", plan=payload.plan)
    await db.commit()
    return {"plan": user.plan.value}


@router.get("/audit")
async def audit(db: DbDep, _: AdminUser) -> list[dict]:
    rows = await db.execute(
        select(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .order_by(AuditLog.created_at.desc())
        .limit(100)
    )
    return [
        {
            "action": a.action,
            "target": a.target,
            "detail": a.detail,
            "actor": u.name if u else None,
            "at": a.created_at,
        }
        for a, u in rows
    ]
