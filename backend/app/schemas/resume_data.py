"""Structured resume/profile data shared by the parser, the profile API and the extension.

Every field is optional: unknown values are null, never invented.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

SKILL_CATEGORIES = (
    "programming_languages",
    "frameworks",
    "databases",
    "cloud",
    "ai_ml",
    "tools",
    "soft_skills",
    "other",
)


class _Model(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PersonalInformation(_Model):
    full_name: str | None = Field(default=None, max_length=200)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    email: str | None = Field(default=None, max_length=320)
    phone: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=200)
    linkedin: str | None = Field(default=None, max_length=500)
    github: str | None = Field(default=None, max_length=500)
    portfolio: str | None = Field(default=None, max_length=500)


class ProfessionalSummary(_Model):
    current_designation: str | None = Field(default=None, max_length=200)
    total_experience_years: float | None = Field(default=None, ge=0, le=70)
    summary: str | None = Field(default=None, max_length=5000)
    employment_status: Literal["employed", "not_employed"] | None = None


class Skills(_Model):
    programming_languages: list[str] = []
    frameworks: list[str] = []
    databases: list[str] = []
    cloud: list[str] = []
    ai_ml: list[str] = []
    tools: list[str] = []
    soft_skills: list[str] = []
    other: list[str] = []


class _Item(_Model):
    confidence: float | None = Field(default=None, ge=0, le=1)
    is_confirmed: bool = False


class ExperienceItem(_Item):
    company_name: str | None = Field(default=None, max_length=200)
    designation: str | None = Field(default=None, max_length=200)
    employment_type: str | None = Field(default=None, max_length=50)
    location: str | None = Field(default=None, max_length=200)
    start_date: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2})?$")
    end_date: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2})?$")
    is_current: bool = False
    responsibilities: list[str] = []
    achievements: list[str] = []
    technologies: list[str] = []


class EducationItem(_Item):
    degree: str | None = Field(default=None, max_length=200)
    institution: str | None = Field(default=None, max_length=200)
    specialization: str | None = Field(default=None, max_length=200)
    start_year: int | None = Field(default=None, ge=1900, le=2100)
    graduation_year: int | None = Field(default=None, ge=1900, le=2100)
    grade: str | None = Field(default=None, max_length=50)


class ProjectItem(_Item):
    project_name: str | None = Field(default=None, max_length=200)
    role: str | None = Field(default=None, max_length=200)
    url: str | None = Field(default=None, max_length=500)
    # What the project was and did, one point per bullet.
    points: list[str] = []


class CertificationItem(_Item):
    certification_name: str | None = Field(default=None, max_length=300)
    issuing_organization: str | None = Field(default=None, max_length=200)
    issue_date: str | None = Field(default=None, pattern=r"^\d{4}(-\d{2})?$")
    credential_url: str | None = Field(default=None, max_length=500)


class FieldMeta(_Model):
    confidence: float = Field(ge=0, le=1)
    source: str | None = Field(default=None, max_length=300)
    is_confirmed: bool = False


class AdditionalInfo(_Model):
    """Answers to common application questions that resumes rarely contain."""

    work_authorization: str | None = Field(default=None, max_length=200)
    requires_sponsorship: bool | None = None
    notice_period: str | None = Field(default=None, max_length=100)
    expected_salary: str | None = Field(default=None, max_length=100)
    current_salary: str | None = Field(default=None, max_length=100)
    willing_to_relocate: bool | None = None
    preferred_locations: list[str] = []
    gender: str | None = Field(default=None, max_length=50)
    pronouns: str | None = Field(default=None, max_length=50)
    date_of_birth: str | None = Field(default=None, max_length=10)
    nationality: str | None = Field(default=None, max_length=100)
    languages: list[str] = []


class ResumeData(_Model):
    personal_information: PersonalInformation = PersonalInformation()
    professional_summary: ProfessionalSummary = ProfessionalSummary()
    experience: list[ExperienceItem] = []
    education: list[EducationItem] = []
    skills: Skills = Skills()
    projects: list[ProjectItem] = []
    certifications: list[CertificationItem] = []
    # Confidence and provenance for scalar fields, keyed by dotted path.
    field_meta: dict[str, FieldMeta] = {}
