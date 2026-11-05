import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

AnswerCategory = Literal[
    "why_company",
    "why_role",
    "about_you",
    "strengths",
    "weaknesses",
    "challenging_project",
    "career_goals",
    "leaving_reason",
    "why_hire",
    "availability",
    "salary",
    "relocation",
    "other",
]


def _clean_variants(value: list[str]) -> list[str]:
    return [v.strip() for v in value if v and v.strip()][:10]


class SavedAnswerBase(BaseModel):
    category: AnswerCategory = "other"
    question_text: str = Field(min_length=3, max_length=500)
    answer_template: str = Field(min_length=1, max_length=10_000)
    variants: list[str] = Field(default_factory=list, max_length=10)

    @field_validator("variants")
    @classmethod
    def _variants(cls, value: list[str]) -> list[str]:
        if any(len(v) > 10_000 for v in value):
            raise ValueError("Each variant must be at most 10,000 characters")
        return _clean_variants(value)

    @field_validator("question_text", "answer_template")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()


class SavedAnswerCreate(SavedAnswerBase):
    pass


class SavedAnswerUpdate(BaseModel):
    category: AnswerCategory | None = None
    question_text: str | None = Field(default=None, min_length=3, max_length=500)
    answer_template: str | None = Field(default=None, min_length=1, max_length=10_000)
    variants: list[str] | None = Field(default=None, max_length=10)

    @field_validator("variants")
    @classmethod
    def _variants(cls, value: list[str] | None) -> list[str] | None:
        return _clean_variants(value) if value is not None else None


class SavedAnswerRead(SavedAnswerBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    usage_count: int
    created_at: datetime
    updated_at: datetime


class AnswerTemplate(BaseModel):
    category: AnswerCategory
    question_text: str
    answer_template: str
    variants: list[str] = []


class AnswerUsageCreate(BaseModel):
    saved_answer_id: uuid.UUID | None = None
    question_text: str = Field(min_length=1, max_length=500)
    final_answer: str = Field(min_length=1, max_length=20_000)
    source: Literal["library", "manual"] = "library"
    company: str | None = Field(default=None, max_length=200)
    job_title: str | None = Field(default=None, max_length=300)
    url: str | None = Field(default=None, max_length=2048)


class AnswerUsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    saved_answer_id: uuid.UUID | None
    question_text: str
    final_answer: str
    source: str
    company: str | None
    job_title: str | None
    url: str | None
    created_at: datetime
