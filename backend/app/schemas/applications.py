import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

StatusValue = Literal[
    "detected", "in_progress", "ready_to_submit", "submitted", "interview", "offer", "rejected"
]


class ApplicationBase(BaseModel):
    company_name: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=300)
    portal: str | None = Field(default=None, max_length=50)
    job_description: str | None = Field(default=None, max_length=50_000)
    notes: str | None = Field(default=None, max_length=10_000)


class ApplicationCreate(ApplicationBase):
    job_url: HttpUrl
    status: StatusValue = "in_progress"
    resume_id: uuid.UUID | None = None


class ApplicationUpdate(BaseModel):
    company_name: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=300)
    job_description: str | None = Field(default=None, max_length=50_000)
    notes: str | None = Field(default=None, max_length=10_000)
    status: StatusValue | None = None
    resume_id: uuid.UUID | None = None


class StatusEvent(BaseModel):
    status: StatusValue
    at: datetime
    by: Literal["user", "extension"]


class ApplicationRead(ApplicationBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    job_url: str
    status: StatusValue
    status_history: list[StatusEvent]
    resume_id: uuid.UUID | None
    fields_detected: int
    fields_filled: int
    source: str
    applied_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AnswerUsageSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    question_text: str
    final_answer: str
    created_at: datetime


class ApplicationDetail(ApplicationRead):
    resume_file_name: str | None
    answers: list[AnswerUsageSummary]


class WeekCount(BaseModel):
    week_start: date
    count: int


class ApplicationStats(BaseModel):
    total: int
    by_status: dict[str, int]
    active: int
    submitted: int
    responses: int
    response_rate: float | None
    this_week: int
    weekly: list[WeekCount]


class DetectedApplication(BaseModel):
    """Sent by the extension when it sees an application page (and after autofill)."""

    job_url: HttpUrl
    company_name: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=300)
    portal: str | None = Field(default=None, max_length=50)
    job_description: str | None = Field(default=None, max_length=50_000)
    fields_detected: int = Field(default=0, ge=0, le=5000)
    fields_filled: int = Field(default=0, ge=0, le=5000)

    @field_validator("company_name", "job_title", "job_description")
    @classmethod
    def _blank_to_none(cls, value: Any) -> Any:
        return value.strip() or None if isinstance(value, str) else value
