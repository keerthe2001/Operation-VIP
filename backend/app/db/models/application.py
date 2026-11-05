import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin


class ApplicationStatus(enum.StrEnum):
    DETECTED = "detected"
    IN_PROGRESS = "in_progress"
    READY_TO_SUBMIT = "ready_to_submit"
    SUBMITTED = "submitted"
    INTERVIEW = "interview"
    OFFER = "offer"
    REJECTED = "rejected"


# Automatic updates only move an application forward through these early stages;
# everything from "submitted" onwards is set by the user.
AUTO_STAGES = [ApplicationStatus.DETECTED, ApplicationStatus.IN_PROGRESS]


class Application(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "applications"
    __table_args__ = (
        UniqueConstraint("user_id", "job_url", name="uq_applications_user_id_job_url"),
        Index("ix_applications_user_id_status", "user_id", "status"),
        Index("ix_applications_user_id_updated_at", "user_id", "updated_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    company_name: Mapped[str | None] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(300))
    job_url: Mapped[str] = mapped_column(String(2048))
    portal: Mapped[str | None] = mapped_column(String(50))
    job_description: Mapped[str | None] = mapped_column(Text)
    resume_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="SET NULL")
    )
    status: Mapped[ApplicationStatus] = mapped_column(
        Enum(
            ApplicationStatus,
            name="application_status",
            values_callable=lambda e: [m.value for m in e],
        ),
        default=ApplicationStatus.DETECTED,
    )
    # [{"status": "submitted", "at": "2026-01-01T00:00:00+00:00", "by": "user"}]
    status_history: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    notes: Mapped[str | None] = mapped_column(Text)
    fields_detected: Mapped[int] = mapped_column(default=0)
    fields_filled: Mapped[int] = mapped_column(default=0)
    source: Mapped[str] = mapped_column(String(20), default="extension")
    applied_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
