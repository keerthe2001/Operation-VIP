import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, field_validator

from app.schemas.resume_data import AdditionalInfo, ResumeData

SectionStatus = Literal["complete", "incomplete", "missing"]


class ProfileWrite(ResumeData):
    """Full profile as edited by the user (PUT replaces everything)."""

    additional_info: AdditionalInfo = AdditionalInfo()

    @field_validator("personal_information")
    @classmethod
    def _normalize_email(cls, value):  # type: ignore[no-untyped-def]
        if value.email:
            value.email = value.email.strip().lower()
        return value


class ProfilePatch(BaseModel):
    """Partial update: only the provided top-level sections are replaced."""

    personal_information: dict[str, object] | None = None
    professional_summary: dict[str, object] | None = None
    skills: dict[str, object] | None = None
    additional_info: dict[str, object] | None = None
    experience: list[dict[str, object]] | None = None
    education: list[dict[str, object]] | None = None
    projects: list[dict[str, object]] | None = None
    certifications: list[dict[str, object]] | None = None
    field_meta: dict[str, object] | None = None


class CompletionItem(BaseModel):
    key: str
    label: str
    done: bool
    weight: int


class ProfileCompletion(BaseModel):
    percentage: int
    sections: dict[str, SectionStatus]
    items: list[CompletionItem]
    unconfirmed_fields: int


class ProfileRead(ProfileWrite):
    id: uuid.UUID
    source_resume_id: uuid.UUID | None
    updated_at: datetime
    completion: ProfileCompletion
