"""Relational schema for Release 1.

Curriculum (career path → levels → topics, plus labs and projects) is data, edited in the
admin and stored here. Lesson bodies are structured JSON documents validated on save.
"""

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JsonDoc = JSON().with_variant(JSONB(), "postgresql")


class Base(DeclarativeBase):
    pass


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


class Timestamped:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class Role(enum.StrEnum):
    STUDENT = "student"
    ADMIN = "admin"


class Plan(enum.StrEnum):
    FREE = "free"
    PRO = "pro"


class PublishStatus(enum.StrEnum):
    DRAFT = "draft"
    PUBLISHED = "published"


class SubmissionStatus(enum.StrEnum):
    SUBMITTED = "submitted"
    PASSED = "passed"
    NEEDS_WORK = "needs_work"


def _enum(e: type[enum.Enum], name: str) -> Enum:
    return Enum(e, name=name, values_callable=lambda x: [m.value for m in x])


# ---------------------------------------------------------------- users


class User(Timestamped, Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    role: Mapped[Role] = mapped_column(_enum(Role, "user_role"), default=Role.STUDENT)
    plan: Mapped[Plan] = mapped_column(_enum(Plan, "user_plan"), default=Plan.FREE)

    profile: Mapped["StudentProfile | None"] = relationship(
        back_populates="user", uselist=False, lazy="selectin"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PasswordReset(Base):
    __tablename__ = "password_resets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class StudentProfile(Timestamped, Base):
    __tablename__ = "student_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    career_path: Mapped[str] = mapped_column(String(64), default="agentic-ai-engineer")
    skill_level: Mapped[str | None] = mapped_column(String(16))  # beginner|intermediate|advanced
    time_budget: Mapped[str | None] = mapped_column(String(16))  # 30m|1h|2h|weekends
    explain_mode: Mapped[str] = mapped_column(String(16), default="simple")  # simple|eng
    autoplay: Mapped[bool] = mapped_column(Boolean, default=True)
    onboarded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="profile")


# ---------------------------------------------------------------- curriculum


class CareerPath(Timestamped, Base):
    __tablename__ = "career_paths"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(64), unique=True)
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.PUBLISHED
    )


class Level(Timestamped, Base):
    __tablename__ = "levels"
    __table_args__ = (UniqueConstraint("path_id", "number"), UniqueConstraint("path_id", "slug"))

    id: Mapped[int] = mapped_column(primary_key=True)
    path_id: Mapped[int] = mapped_column(ForeignKey("career_paths.id", ondelete="CASCADE"))
    number: Mapped[int] = mapped_column(Integer)  # 0 = starter pack
    slug: Mapped[str] = mapped_column(String(64))
    title: Mapped[str] = mapped_column(String(160))
    summary: Mapped[str] = mapped_column(Text, default="")
    hours: Mapped[int] = mapped_column(Integer, default=10)
    # Optional levels (the beginner starter pack) never block unlocks or certificates.
    optional: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.PUBLISHED
    )

    topics: Mapped[list["Topic"]] = relationship(
        back_populates="level", order_by="Topic.number", lazy="selectin"
    )


class Topic(Timestamped, Base):
    __tablename__ = "topics"
    __table_args__ = (UniqueConstraint("level_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    level_id: Mapped[int] = mapped_column(ForeignKey("levels.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    slug: Mapped[str] = mapped_column(String(96), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    minutes: Mapped[int] = mapped_column(Integer, default=8)
    # Structured lesson document: objectives, scenes, points, words, code, checks.
    body: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.DRAFT
    )
    version: Mapped[int] = mapped_column(Integer, default=1)

    level: Mapped[Level] = relationship(back_populates="topics")


class Lab(Timestamped, Base):
    __tablename__ = "labs"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True)
    topic_id: Mapped[int | None] = mapped_column(
        ForeignKey("topics.id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.DRAFT
    )


class Project(Timestamped, Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(96), unique=True)
    level_id: Mapped[int] = mapped_column(ForeignKey("levels.id", ondelete="CASCADE"), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    # problem, requirements, milestones, rubric (criteria with points), pass_mark
    body: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.DRAFT
    )


class Guide(Timestamped, Base):
    """Public articles: career guides and tutorials."""

    __tablename__ = "guides"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(120), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    summary: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(48), default="Career guide")
    minutes: Mapped[int] = mapped_column(Integer, default=5)
    body: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    status: Mapped[PublishStatus] = mapped_column(
        _enum(PublishStatus, "publish_status"), default=PublishStatus.DRAFT
    )


# ---------------------------------------------------------------- progress and evidence


class TopicProgress(Timestamped, Base):
    __tablename__ = "topic_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    topic_id: Mapped[int] = mapped_column(
        ForeignKey("topics.id", ondelete="CASCADE"), primary_key=True
    )
    watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checks_passed: Mapped[list[str]] = mapped_column(JsonDoc, default=list)
    practised_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tested_out: Mapped[bool] = mapped_column(Boolean, default=False)


class LabProgress(Timestamped, Base):
    __tablename__ = "lab_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    lab_id: Mapped[int] = mapped_column(ForeignKey("labs.id", ondelete="CASCADE"), primary_key=True)
    steps_done: Mapped[list[str]] = mapped_column(JsonDoc, default=list)
    code: Mapped[dict[str, str]] = mapped_column(JsonDoc, default=dict)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Attempt(Base):
    """One answer to a practice question (any engine)."""

    __tablename__ = "attempts"
    __table_args__ = (Index("ix_attempts_user_created", "user_id", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id", ondelete="CASCADE"))
    question_id: Mapped[str] = mapped_column(String(64))
    correct: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class XpTransaction(Base):
    """XP ledger. (user, reason, ref) is unique so the same evidence never pays twice."""

    __tablename__ = "xp_transactions"
    __table_args__ = (UniqueConstraint("user_id", "reason", "ref"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[int] = mapped_column(Integer)
    reason: Mapped[str] = mapped_column(String(48))
    ref: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class StudentAchievement(Base):
    __tablename__ = "student_achievements"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    code: Mapped[str] = mapped_column(String(48), primary_key=True)
    earned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Activity(Base):
    """Learning-minute log used for the weekly chart and streaks (one row per event)."""

    __tablename__ = "activity"
    __table_args__ = (Index("ix_activity_user_day", "user_id", "day"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[str] = mapped_column(String(10))  # YYYY-MM-DD in the learner's time zone
    kind: Mapped[str] = mapped_column(String(32))
    label: Mapped[str] = mapped_column(String(200))
    minutes: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProjectProgress(Timestamped, Base):
    __tablename__ = "project_progress"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True
    )
    milestones_done: Mapped[list[str]] = mapped_column(JsonDoc, default=list)


class Submission(Timestamped, Base):
    __tablename__ = "submissions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    repo_url: Mapped[str] = mapped_column(String(300))
    demo_url: Mapped[str | None] = mapped_column(String(300))
    notes: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[SubmissionStatus] = mapped_column(
        _enum(SubmissionStatus, "submission_status"), default=SubmissionStatus.SUBMITTED
    )
    rubric_scores: Mapped[dict[str, int]] = mapped_column(JsonDoc, default=dict)
    score: Mapped[int | None] = mapped_column(Integer)
    feedback: Mapped[str] = mapped_column(Text, default="")
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Certificate(Base):
    __tablename__ = "certificates"
    __table_args__ = (UniqueConstraint("user_id", "path_id"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    path_id: Mapped[int] = mapped_column(ForeignKey("career_paths.id", ondelete="CASCADE"))
    name_on_certificate: Mapped[str] = mapped_column(String(120))
    summary: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- operations


class AdPlacement(Base):
    __tablename__ = "ad_placements"

    placement: Mapped[str] = mapped_column(String(48), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    ad_unit_id: Mapped[str | None] = mapped_column(String(64))


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64))
    target: Mapped[str] = mapped_column(String(160))
    detail: Mapped[dict[str, Any]] = mapped_column(JsonDoc, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
