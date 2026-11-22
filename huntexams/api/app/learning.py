"""The learning engine: XP, achievements, unlocks, pace, next activity and certificates.

Every rule here is deterministic and based on recorded evidence, never on page views.
"""

import math
import secrets
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.content import XP_RULES
from app.models import (
    Activity,
    CareerPath,
    Certificate,
    Lab,
    LabProgress,
    Level,
    Project,
    PublishStatus,
    StudentAchievement,
    Submission,
    SubmissionStatus,
    Topic,
    TopicProgress,
    User,
    XpTransaction,
)

ACHIEVEMENTS: dict[str, dict[str, str]] = {
    "first_scene": {
        "title": "First scene watched",
        "icon": "★",
        "tone": "l2",
        "how": "Watch a motion scene to the end",
    },
    "first_check": {
        "title": "First check passed",
        "icon": "✓",
        "tone": "l3",
        "how": "Answer a lesson question correctly",
    },
    "first_code_run": {
        "title": "First code run",
        "icon": "▶",
        "tone": "l4",
        "how": "Run Python in the sandbox",
    },
    "first_lab": {
        "title": "First guided lab",
        "icon": "⚗",
        "tone": "l7",
        "how": "Finish a guided lab",
    },
    "first_topic": {
        "title": "First topic practised",
        "icon": "◆",
        "tone": "l1",
        "how": "Pass every check in one topic",
    },
    "first_mission": {
        "title": "First mission submitted",
        "icon": "⬆",
        "tone": "l6",
        "how": "Submit a level mission",
    },
    "rag_builder": {
        "title": "RAG builder",
        "icon": "◎",
        "tone": "l4",
        "how": "Pass the Level 4 mission",
    },
    "agent_developer": {
        "title": "Agent developer",
        "icon": "⬡",
        "tone": "l5",
        "how": "Pass the Level 5 mission",
    },
    "streak_7": {
        "title": "7-day streak",
        "icon": "🔥",
        "tone": "l2",
        "how": "Learn on 7 days in a row",
    },
    "certified": {
        "title": "Certified",
        "icon": "▲",
        "tone": "l8",
        "how": "Earn the Agentic AI Engineer certificate",
    },
}

WEEKLY_HOURS = {"30m": 3.5, "1h": 7.0, "2h": 14.0, "weekends": 6.0}
TIME_LABELS = {
    "30m": "30 minutes a day",
    "1h": "1 hour a day",
    "2h": "2 hours a day",
    "weekends": "Weekends only",
}


def today_for(tz_name: str | None) -> date:
    try:
        tz = ZoneInfo(tz_name) if tz_name else UTC
    except (ZoneInfoNotFoundError, ValueError):
        tz = UTC
    return datetime.now(tz).date()


# ---------------------------------------------------------------- ledger


async def award(
    session: AsyncSession, user_id: uuid.UUID, reason: str, ref: str, amount: int | None = None
) -> int:
    """Pay XP once per (reason, ref). Returns the amount paid now (0 if already paid)."""
    exists = await session.scalar(
        select(XpTransaction.id).where(
            XpTransaction.user_id == user_id,
            XpTransaction.reason == reason,
            XpTransaction.ref == ref,
        )
    )
    if exists:
        return 0
    value = XP_RULES[reason] if amount is None else amount
    session.add(XpTransaction(user_id=user_id, reason=reason, ref=ref, amount=value))
    return value


async def grant(session: AsyncSession, user_id: uuid.UUID, code: str) -> str | None:
    if code not in ACHIEVEMENTS:
        return None
    if await session.get(StudentAchievement, (user_id, code)):
        return None
    session.add(StudentAchievement(user_id=user_id, code=code))
    return code


async def log_activity(
    session: AsyncSession, user_id: uuid.UUID, day: date, kind: str, label: str, minutes: int
) -> None:
    session.add(
        Activity(
            user_id=user_id,
            day=day.isoformat(),
            kind=kind,
            label=label[:200],
            minutes=max(0, minutes),
        )
    )


async def total_xp(session: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        await session.scalar(
            select(func.coalesce(func.sum(XpTransaction.amount), 0)).where(
                XpTransaction.user_id == user_id
            )
        )
        or 0
    )


async def streak(session: AsyncSession, user_id: uuid.UUID, today: date) -> int:
    rows = await session.scalars(select(Activity.day).where(Activity.user_id == user_id).distinct())
    days = {date.fromisoformat(d) for d in rows}
    cursor = today if today in days else today - timedelta(days=1)
    count = 0
    while cursor in days:
        count += 1
        cursor -= timedelta(days=1)
    return count


# ---------------------------------------------------------------- curriculum + progress


async def published_path(session: AsyncSession) -> CareerPath | None:
    return await session.scalar(
        select(CareerPath)
        .where(CareerPath.status == PublishStatus.PUBLISHED)
        .order_by(CareerPath.id)
    )


async def published_levels(session: AsyncSession, path_id: int) -> list[Level]:
    levels = list(
        await session.scalars(
            select(Level)
            .where(Level.path_id == path_id, Level.status == PublishStatus.PUBLISHED)
            .order_by(Level.number)
        )
    )
    for lv in levels:
        lv.__dict__["published_topics"] = [
            t for t in lv.topics if t.status == PublishStatus.PUBLISHED
        ]
    return levels


def topics_of(level: Level) -> list[Topic]:
    return level.__dict__.get("published_topics", level.topics)


def topic_state(tp: TopicProgress | None, topic: Topic) -> dict[str, Any]:
    checks = [q["id"] for q in topic.body.get("checks", [])]
    passed = [c for c in (tp.checks_passed if tp else []) if c in checks]
    practised = bool(tp and (tp.practised_at or tp.tested_out))
    status = (
        "practised"
        if practised
        else ("watched" if tp and tp.watched_at else ("started" if passed else "new"))
    )
    return {
        "status": status,
        "checks_total": len(checks),
        "checks_passed": len(passed),
        "watched": bool(tp and tp.watched_at),
        "tested_out": bool(tp and tp.tested_out),
    }


async def learner_state(
    session: AsyncSession, user: User, today: date | None = None
) -> dict[str, Any]:
    today = today or datetime.now(UTC).date()
    path = await published_path(session)
    if not path:
        return {"levels": [], "next": None}
    levels = await published_levels(session, path.id)
    progress = {
        tp.topic_id: tp
        for tp in await session.scalars(
            select(TopicProgress).where(TopicProgress.user_id == user.id)
        )
    }
    projects = {
        p.level_id: p
        for p in await session.scalars(
            select(Project).where(Project.status == PublishStatus.PUBLISHED)
        )
    }
    subs: dict[int, Submission] = {}
    for s in await session.scalars(
        select(Submission).where(Submission.user_id == user.id).order_by(Submission.created_at)
    ):
        prev = subs.get(s.project_id)
        keep_prev = prev is not None and prev.status == SubmissionStatus.PASSED
        if not keep_prev:
            subs[s.project_id] = s
    labs = {
        lab.topic_id: lab
        for lab in await session.scalars(select(Lab).where(Lab.status == PublishStatus.PUBLISHED))
    }
    lab_done = {
        lp.lab_id
        for lp in await session.scalars(
            select(LabProgress).where(
                LabProgress.user_id == user.id, LabProgress.completed_at.is_not(None)
            )
        )
    }

    out_levels: list[dict[str, Any]] = []
    unlocked_next = True
    for lv in levels:
        topics = topics_of(lv)
        tstates = []
        for t in topics:
            st = topic_state(progress.get(t.id), t)
            lab = labs.get(t.id)
            st.update(
                {
                    "slug": t.slug,
                    "title": t.title,
                    "number": t.number,
                    "minutes": t.minutes,
                    "lab": lab.slug if lab else None,
                    "lab_done": bool(lab and lab.id in lab_done),
                }
            )
            tstates.append(st)
        done = sum(1 for s in tstates if s["status"] == "practised")
        complete = bool(topics) and done == len(topics)
        project = projects.get(lv.id)
        sub = subs.get(project.id) if project else None
        mission = None
        if project:
            mission = {
                "slug": project.slug,
                "title": project.title,
                "status": sub.status.value if sub else "not_submitted",
                "score": sub.score if sub else None,
            }
        unlocked = lv.optional or unlocked_next
        out_levels.append(
            {
                "number": lv.number,
                "slug": lv.slug,
                "title": lv.title,
                "summary": lv.summary,
                "hours": lv.hours,
                "optional": lv.optional,
                "unlocked": unlocked,
                "topics": tstates,
                "practised": done,
                "complete": complete,
                "mission": mission,
                "proven": complete and (mission is None or mission["status"] == "passed"),
            }
        )
        if not lv.optional:
            unlocked_next = unlocked and complete

    profile = user.profile
    required = [lv for lv in out_levels if not lv["optional"]]
    total_topics = sum(len(lv["topics"]) for lv in required)
    done_topics = sum(lv["practised"] for lv in required)
    cert = await session.scalar(
        select(Certificate).where(Certificate.user_id == user.id, Certificate.path_id == path.id)
    )
    eligible = bool(required) and all(lv["proven"] for lv in required)

    return {
        "path": {"slug": path.slug, "title": path.title},
        "levels": out_levels,
        "totals": {
            "topics": total_topics,
            "practised": done_topics,
            "percent": round(100 * done_topics / total_topics) if total_topics else 0,
        },
        "xp": await total_xp(session, user.id),
        "streak": await streak(session, user.id, today),
        "week": await week_minutes(session, user.id, today),
        "next": next_activity(out_levels, profile.skill_level if profile else None),
        "certificate": {"eligible": eligible, "code": cert.code if cert else None},
        "plan": plan_for(
            levels,
            profile.skill_level if profile else None,
            profile.time_budget if profile else None,
        ),
    }


async def week_minutes(session: AsyncSession, user_id: uuid.UUID, today: date) -> list[dict]:
    start = today - timedelta(days=6)
    rows = await session.execute(
        select(Activity.day, func.sum(Activity.minutes))
        .where(Activity.user_id == user_id, Activity.day >= start.isoformat())
        .group_by(Activity.day)
    )
    by_day = {d: int(m or 0) for d, m in rows}
    return [
        {
            "day": (start + timedelta(days=i)).isoformat(),
            "minutes": by_day.get((start + timedelta(days=i)).isoformat(), 0),
        }
        for i in range(7)
    ]


def next_activity(levels: list[dict[str, Any]], skill: str | None) -> dict[str, Any] | None:
    """Pick the single best next thing to do."""
    order = list(levels)
    starter = next((lv for lv in order if lv["optional"]), None)
    if starter and (skill != "beginner" or starter["complete"]):
        order = [lv for lv in order if not lv["optional"]]
    for lv in order:
        if not lv["unlocked"]:
            break
        if not lv["complete"]:
            fresh = all(t["status"] == "new" for t in lv["topics"])
            if skill == "advanced" and fresh and lv["number"] in (1, 2):
                return {
                    "kind": "diagnostic",
                    "level": lv["number"],
                    "slug": lv["slug"],
                    "title": f"15-minute diagnostic: Level {lv['number']}",
                    "why": "You said you already write software. Pass this to skip the "
                    "level, or keep it if the questions show gaps.",
                    "minutes": 15,
                }
            for t in lv["topics"]:
                if t["status"] == "practised":
                    if t["lab"] and not t["lab_done"]:
                        return {
                            "kind": "lab",
                            "level": lv["number"],
                            "slug": t["lab"],
                            "topic": t["slug"],
                            "title": f"Guided lab: {t['title']}",
                            "why": "You passed the checks. The lab has you build it yourself, "
                            "one small step at a time.",
                            "minutes": 15,
                        }
                    continue
                if not t["watched"]:
                    why = (
                        "Next in your route. It starts with a short scene that plays by itself."
                        if t["number"] > 1
                        else f"The first topic of {lv['title']}."
                    )
                    return {
                        "kind": "watch",
                        "level": lv["number"],
                        "slug": t["slug"],
                        "title": t["title"],
                        "why": why,
                        "minutes": t["minutes"],
                    }
                left = t["checks_total"] - t["checks_passed"]
                return {
                    "kind": "practise",
                    "level": lv["number"],
                    "slug": t["slug"],
                    "title": t["title"],
                    "why": f"You watched the scene. {left} quick question"
                    f"{'s' if left != 1 else ''} will lock it in.",
                    "minutes": 4,
                }
        mission = lv["mission"]
        if mission and mission["status"] in ("not_submitted", "needs_work"):
            return {
                "kind": "mission",
                "level": lv["number"],
                "slug": mission["slug"],
                "title": mission["title"],
                "why": "Every topic in this level is practised. The mission proves you can "
                "build it."
                if mission["status"] == "not_submitted"
                else "Your reviewer left feedback. Fix it and resubmit.",
                "minutes": 120,
            }
    if levels and all(lv["proven"] for lv in levels if not lv["optional"]):
        return {
            "kind": "certificate",
            "title": "Claim your certificate",
            "why": "Every level is proven with a passed mission.",
            "minutes": 1,
        }
    return None


def plan_for(levels: list[Level], skill: str | None, budget: str | None) -> dict[str, Any] | None:
    if not skill or not budget:
        return None
    hours = sum(lv.hours for lv in levels if not lv.optional)
    start = next((lv for lv in levels if not lv.optional), None)
    start_label = f"Level {start.number} · {start.title}" if start else ""
    mode = "eng"
    if skill == "beginner":
        mode = "simple"
        starter = next((lv for lv in levels if lv.optional), None)
        if starter:
            hours += starter.hours
            start_label = f"Starter · {starter.title}"
    if skill == "advanced":
        hours -= sum(lv.hours for lv in levels if lv.number in (1, 2))
        start_label = "15-minute diagnostics for Levels 1 and 2"
    weekly = WEEKLY_HOURS.get(budget, 7.0)
    return {
        "hours": hours,
        "weekly_hours": weekly,
        "weeks": math.ceil(hours / weekly),
        "start": start_label,
        "time_label": TIME_LABELS.get(budget, ""),
        "explain_mode": mode,
    }


# ---------------------------------------------------------------- certificates


def new_certificate_code(year: int) -> str:
    return f"HX-AAE-{year}-{secrets.randbelow(90000) + 10000}"
