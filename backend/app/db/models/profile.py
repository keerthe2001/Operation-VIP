import uuid
from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin

TextArray = ARRAY(Text)


class UserProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    source_resume_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("resumes.id", ondelete="SET NULL")
    )
    personal_information: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    professional_summary: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    skills: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    additional_info: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    # {"personal_information.email": {"confidence": 0.95, "source": "...", "is_confirmed": false}}
    field_meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    experience: Mapped[list["WorkExperience"]] = relationship(
        cascade="all, delete-orphan", order_by="WorkExperience.sort_order", lazy="selectin"
    )
    education: Mapped[list["Education"]] = relationship(
        cascade="all, delete-orphan", order_by="Education.sort_order", lazy="selectin"
    )
    projects: Mapped[list["Project"]] = relationship(
        cascade="all, delete-orphan", order_by="Project.sort_order", lazy="selectin"
    )
    certifications: Mapped[list["Certification"]] = relationship(
        cascade="all, delete-orphan", order_by="Certification.sort_order", lazy="selectin"
    )


class _ProfileItem(UUIDPrimaryKeyMixin):
    profile_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user_profiles.id", ondelete="CASCADE"), index=True
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    confidence: Mapped[float | None] = mapped_column(Float)
    is_confirmed: Mapped[bool] = mapped_column(default=False)


class WorkExperience(_ProfileItem, Base):
    __tablename__ = "work_experience"

    company_name: Mapped[str | None] = mapped_column(String(200))
    designation: Mapped[str | None] = mapped_column(String(200))
    employment_type: Mapped[str | None] = mapped_column(String(50))
    location: Mapped[str | None] = mapped_column(String(200))
    # Partial ISO dates: "2021", "2021-03". Precision is preserved, never invented.
    start_date: Mapped[str | None] = mapped_column(String(10))
    end_date: Mapped[str | None] = mapped_column(String(10))
    is_current: Mapped[bool] = mapped_column(default=False)
    responsibilities: Mapped[list[str]] = mapped_column(TextArray, default=list)
    achievements: Mapped[list[str]] = mapped_column(TextArray, default=list)
    technologies: Mapped[list[str]] = mapped_column(TextArray, default=list)


class Education(_ProfileItem, Base):
    __tablename__ = "education"

    degree: Mapped[str | None] = mapped_column(String(200))
    institution: Mapped[str | None] = mapped_column(String(200))
    specialization: Mapped[str | None] = mapped_column(String(200))
    start_year: Mapped[int | None]
    graduation_year: Mapped[int | None]
    grade: Mapped[str | None] = mapped_column(String(50))


class Project(_ProfileItem, Base):
    __tablename__ = "projects"

    project_name: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    role: Mapped[str | None] = mapped_column(String(200))
    technologies: Mapped[list[str]] = mapped_column(TextArray, default=list)
    outcomes: Mapped[list[str]] = mapped_column(TextArray, default=list)
    url: Mapped[str | None] = mapped_column(String(500))


class Certification(_ProfileItem, Base):
    __tablename__ = "certifications"

    certification_name: Mapped[str | None] = mapped_column(String(300))
    issuing_organization: Mapped[str | None] = mapped_column(String(200))
    issue_date: Mapped[str | None] = mapped_column(String(10))
    credential_url: Mapped[str | None] = mapped_column(String(500))
