"""Level missions (projects), submissions, certificates and public site config."""

import re
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core import api_error, not_found, rate_limit
from app.deps import CurrentUser, DbDep, OptionalUser, SettingsDep
from app.learning import (
    award,
    grant,
    learner_state,
    log_activity,
    new_certificate_code,
    published_path,
    today_for,
)
from app.models import (
    AdPlacement,
    Certificate,
    Guide,
    Level,
    Project,
    ProjectProgress,
    PublishStatus,
    Submission,
    SubmissionStatus,
)

router = APIRouter(tags=["projects"])

GITHUB_RE = re.compile(r"^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/?$")
URL_RE = re.compile(r"^https://[^\s<>\"']{3,290}$")


def _writes(request: Request) -> int:
    return request.app.state.settings.rate_limit_writes_per_minute


WriteLimit = Depends(rate_limit("writes", _writes))


async def _project(db, slug: str) -> tuple[Project, Level]:  # type: ignore[no-untyped-def]
    project = await db.scalar(select(Project).where(Project.slug == slug))
    if not project or project.status != PublishStatus.PUBLISHED:
        raise not_found("That mission doesn't exist.")
    return project, await db.get(Level, project.level_id)


def _sub_out(s: Submission) -> dict[str, Any]:
    return {
        "id": str(s.id),
        "repo_url": s.repo_url,
        "demo_url": s.demo_url,
        "notes": s.notes,
        "status": s.status.value,
        "score": s.score,
        "rubric_scores": s.rubric_scores,
        "feedback": s.feedback,
        "created_at": s.created_at,
        "reviewed_at": s.reviewed_at,
    }


@router.get("/projects/{slug}")
async def get_project(slug: str, db: DbDep, user: OptionalUser) -> dict:
    project, level = await _project(db, slug)
    out: dict[str, Any] = {
        "slug": project.slug,
        "title": project.title,
        "body": project.body,
        "level": {"number": level.number, "slug": level.slug, "title": level.title},
        "progress": None,
    }
    if user:
        pp = await db.get(ProjectProgress, (user.id, project.id))
        subs = await db.scalars(
            select(Submission)
            .where(Submission.user_id == user.id, Submission.project_id == project.id)
            .order_by(Submission.created_at.desc())
        )
        state = await learner_state(db, user)
        lv = next((x for x in state["levels"] if x["number"] == level.number), None)
        out["progress"] = {
            "milestones_done": pp.milestones_done if pp else [],
            "submissions": [_sub_out(s) for s in subs],
            "unlocked": bool(lv and lv["unlocked"]),
            "level_complete": bool(lv and lv["complete"]),
        }
    return out


class MilestonesIn(BaseModel):
    done: list[int] = Field(max_length=50)


@router.put("/projects/{slug}/milestones", dependencies=[WriteLimit])
async def set_milestones(slug: str, body: MilestonesIn, db: DbDep, user: CurrentUser) -> dict:
    project, _ = await _project(db, slug)
    count = len(project.body.get("milestones", []))
    done = sorted({i for i in body.done if 0 <= i < count})
    pp = await db.get(ProjectProgress, (user.id, project.id))
    if not pp:
        pp = ProjectProgress(user_id=user.id, project_id=project.id)
        db.add(pp)
    pp.milestones_done = [str(i) for i in done]
    await db.commit()
    return {"milestones_done": pp.milestones_done}


class SubmissionIn(BaseModel):
    repo_url: str = Field(max_length=300)
    demo_url: str | None = Field(default=None, max_length=300)
    notes: str = Field(default="", max_length=4000)

    @field_validator("repo_url")
    @classmethod
    def _repo(cls, v: str) -> str:
        v = v.strip()
        if not GITHUB_RE.match(v):
            raise ValueError("Use a GitHub repository link, like https://github.com/you/project")
        return v

    @field_validator("demo_url")
    @classmethod
    def _demo(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        if not v:
            return None
        if not URL_RE.match(v):
            raise ValueError("The demo link must start with https://")
        return v


@router.post("/projects/{slug}/submissions", status_code=201, dependencies=[WriteLimit])
async def submit(
    slug: str, body: SubmissionIn, request: Request, db: DbDep, user: CurrentUser
) -> dict:
    project, level = await _project(db, slug)
    state = await learner_state(db, user)
    lv = next((x for x in state["levels"] if x["number"] == level.number), None)
    if not lv or not lv["unlocked"]:
        raise api_error(403, f"Finish Level {level.number - 1} first.", "locked")
    pending = await db.scalar(
        select(Submission.id).where(
            Submission.user_id == user.id,
            Submission.project_id == project.id,
            Submission.status == SubmissionStatus.SUBMITTED,
        )
    )
    if pending:
        raise api_error(409, "You already have a submission waiting for review.", "pending")
    passed = await db.scalar(
        select(Submission.id).where(
            Submission.user_id == user.id,
            Submission.project_id == project.id,
            Submission.status == SubmissionStatus.PASSED,
        )
    )
    if passed:
        raise api_error(409, "This mission has already passed.", "passed")
    sub = Submission(
        user_id=user.id,
        project_id=project.id,
        repo_url=body.repo_url,
        demo_url=body.demo_url,
        notes=body.notes.strip(),
    )
    db.add(sub)
    xp = await award(db, user.id, "mission_submitted", project.slug)
    new = [a for a in [await grant(db, user.id, "first_mission")] if a]
    await log_activity(
        db,
        user.id,
        today_for(request.headers.get("x-timezone")),
        "mission",
        f"Submitted: {project.title}",
        0,
    )
    await db.commit()
    return {"submission": _sub_out(sub), "xp": xp, "achievements": new}


# ---------------------------------------------------------------- certificates


def _cert_out(c: Certificate) -> dict[str, Any]:
    return {
        "code": c.code,
        "name": c.name_on_certificate,
        "issued_at": c.issued_at,
        "path": "Agentic AI Engineer",
        "summary": c.summary,
    }


@router.post("/certificates/claim", status_code=201)
async def claim(db: DbDep, user: CurrentUser) -> dict:
    state = await learner_state(db, user)
    if state["certificate"]["code"]:
        cert = await db.scalar(
            select(Certificate).where(Certificate.code == state["certificate"]["code"])
        )
        return _cert_out(cert)
    if not state["certificate"]["eligible"]:
        raise api_error(403, "Finish every level and pass every mission first.", "not_eligible")
    path = await published_path(db)
    required = [lv for lv in state["levels"] if not lv["optional"]]
    summary = {
        "levels": len(required),
        "topics": state["totals"]["topics"],
        "missions": sum(1 for lv in required if lv["mission"]),
    }
    for _ in range(5):
        cert = Certificate(
            code=new_certificate_code(datetime.now(UTC).year),
            user_id=user.id,
            path_id=path.id,
            name_on_certificate=user.name,
            summary=summary,
        )
        db.add(cert)
        try:
            await grant(db, user.id, "certified")
            await db.commit()
            return _cert_out(cert)
        except IntegrityError:
            await db.rollback()
    raise api_error(500, "Couldn't issue a certificate. Try again.", "retry")


def _verify_limit(_: Request) -> int:
    return 30


@router.get("/certificates/{code}", dependencies=[Depends(rate_limit("verify", _verify_limit))])
async def verify(code: str, db: DbDep) -> dict:
    """Public check. Rate-limited so IDs can't be enumerated to harvest names."""
    cert = await db.scalar(select(Certificate).where(Certificate.code == code.strip().upper()))
    if not cert:
        raise not_found("No certificate has this ID.")
    return _cert_out(cert)


@router.get("/me/certificate")
async def my_certificate(db: DbDep, user: CurrentUser) -> dict:
    cert = await db.scalar(select(Certificate).where(Certificate.user_id == user.id))
    return {"certificate": _cert_out(cert) if cert else None}


# ---------------------------------------------------------------- public site


@router.get("/public/config")
async def public_config(db: DbDep, settings: SettingsDep) -> dict:
    placements = {
        p.placement: {
            "enabled": p.enabled and bool(settings.adsense_publisher_id),
            "unit": p.ad_unit_id,
        }
        for p in await db.scalars(select(AdPlacement))
    }
    return {"adsense_publisher_id": settings.adsense_publisher_id, "placements": placements}


@router.get("/guides")
async def guides(db: DbDep) -> list[dict]:
    rows = await db.scalars(
        select(Guide).where(Guide.status == PublishStatus.PUBLISHED).order_by(Guide.id)
    )
    return [
        {
            "slug": g.slug,
            "title": g.title,
            "summary": g.summary,
            "category": g.category,
            "minutes": g.minutes,
        }
        for g in rows
    ]


@router.get("/guides/{slug}")
async def guide(slug: str, db: DbDep) -> dict:
    g = await db.scalar(select(Guide).where(Guide.slug == slug))
    if not g or g.status != PublishStatus.PUBLISHED:
        raise not_found("That guide doesn't exist.")
    return {
        "slug": g.slug,
        "title": g.title,
        "summary": g.summary,
        "category": g.category,
        "minutes": g.minutes,
        "body": g.body,
        "updated_at": g.updated_at,
    }
