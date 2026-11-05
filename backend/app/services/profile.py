import uuid
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.base import utcnow
from app.db.models import (
    Certification,
    Education,
    Project,
    Resume,
    ResumeStatus,
    UserProfile,
    WorkExperience,
)
from app.schemas.profile import (
    CompletionItem,
    ProfileCompletion,
    ProfilePatch,
    ProfileRead,
    ProfileWrite,
)
from app.schemas.resume_data import (
    AdditionalInfo,
    CertificationItem,
    EducationItem,
    ExperienceItem,
    FieldMeta,
    PersonalInformation,
    ProfessionalSummary,
    ProjectItem,
    ResumeData,
    Skills,
)

ITEM_MODELS: dict[str, tuple[type[Any], type[Any]]] = {
    "experience": (WorkExperience, ExperienceItem),
    "education": (Education, EducationItem),
    "projects": (Project, ProjectItem),
    "certifications": (Certification, CertificationItem),
}


class ResumeNotReadyError(AppError):
    status_code = 409
    code = "RESUME_NOT_READY"
    message = "This resume hasn't finished processing."


class ProfileService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get(self, user_id: uuid.UUID) -> UserProfile | None:
        result = await self.session.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create(self, user_id: uuid.UUID) -> UserProfile:
        profile = await self.get(user_id)
        if profile is None:
            profile = UserProfile(
                user_id=user_id,
                personal_information={},
                professional_summary={},
                skills={},
                additional_info={},
                field_meta={},
            )
            self.session.add(profile)
            await self.session.flush()
            await self.session.refresh(
                profile, ["experience", "education", "projects", "certifications"]
            )
        return profile

    # ------------------------------------------------------------------ writes

    async def replace(self, user_id: uuid.UUID, data: ProfileWrite) -> UserProfile:
        profile = await self.get_or_create(user_id)
        await self._apply(profile, data)
        await self.session.commit()
        return await self._reload(user_id)

    async def patch(self, user_id: uuid.UUID, patch: ProfilePatch) -> UserProfile:
        profile = await self.get_or_create(user_id)
        current = self.to_write(profile).model_dump(mode="json")
        for key, value in patch.model_dump(exclude_unset=True).items():
            if value is None:
                continue
            if (
                isinstance(value, dict)
                and isinstance(current.get(key), dict)
                and key != "field_meta"
            ):
                current[key] = {**current[key], **value}
            else:
                current[key] = value
        await self._apply(profile, ProfileWrite.model_validate(current))
        await self.session.commit()
        return await self._reload(user_id)

    async def import_resume(self, user_id: uuid.UUID, resume: Resume) -> UserProfile:
        if resume.status != ResumeStatus.READY or not resume.extracted_data:
            raise ResumeNotReadyError()
        profile = await self.get_or_create(user_id)
        await self._apply_resume(profile, resume)
        await self.session.commit()
        return await self._reload(user_id)

    async def seed_from_resume_if_empty(self, user_id: uuid.UUID, resume: Resume) -> bool:
        """Create the profile from a resume unless the user already has profile data."""
        profile = await self.get_or_create(user_id)
        if not self._is_empty(profile):
            return False
        await self._apply_resume(profile, resume)
        return True

    async def _apply_resume(self, profile: UserProfile, resume: Resume) -> None:
        parsed = ResumeData.model_validate(resume.extracted_data)
        data = ProfileWrite(
            **parsed.model_dump(),
            additional_info=AdditionalInfo.model_validate(profile.additional_info or {}),
        )
        await self._apply(profile, data)
        profile.source_resume_id = resume.id

    async def _apply(self, profile: UserProfile, data: ProfileWrite) -> None:
        profile.personal_information = data.personal_information.model_dump(mode="json")
        profile.professional_summary = data.professional_summary.model_dump(mode="json")
        profile.skills = data.skills.model_dump(mode="json")
        profile.additional_info = data.additional_info.model_dump(mode="json")
        profile.field_meta = {k: v.model_dump(mode="json") for k, v in data.field_meta.items()}
        # Child rows change without touching this row; bump explicitly (extension ETag uses it).
        profile.updated_at = utcnow()
        for attr, (model, _schema) in ITEM_MODELS.items():
            await self.session.execute(delete(model).where(model.profile_id == profile.id))
            items = getattr(data, attr)
            rows = [
                model(profile_id=profile.id, sort_order=index, **item.model_dump(mode="json"))
                for index, item in enumerate(items)
            ]
            self.session.add_all(rows)
        await self.session.flush()
        self.session.expire(profile, ["experience", "education", "projects", "certifications"])

    async def _reload(self, user_id: uuid.UUID) -> UserProfile:
        self.session.expire_all()
        profile = await self.get(user_id)
        if profile is None:  # pragma: no cover - created earlier in the same transaction
            raise RuntimeError("Profile disappeared during update")
        return profile

    @staticmethod
    def _is_empty(profile: UserProfile) -> bool:
        personal = profile.personal_information or {}
        return (
            not any(personal.values())
            and not profile.experience
            and not profile.education
            and not any((profile.skills or {}).values())
        )

    # ------------------------------------------------------------------ reads

    def to_write(self, profile: UserProfile) -> ProfileWrite:
        def items(attr: str) -> list[Any]:
            _model, schema = ITEM_MODELS[attr]
            return [
                schema.model_validate(row, from_attributes=True) for row in getattr(profile, attr)
            ]

        return ProfileWrite(
            personal_information=PersonalInformation.model_validate(
                profile.personal_information or {}
            ),
            professional_summary=ProfessionalSummary.model_validate(
                profile.professional_summary or {}
            ),
            skills=Skills.model_validate(profile.skills or {}),
            additional_info=AdditionalInfo.model_validate(profile.additional_info or {}),
            experience=items("experience"),
            education=items("education"),
            projects=items("projects"),
            certifications=items("certifications"),
            field_meta={
                k: FieldMeta.model_validate(v) for k, v in (profile.field_meta or {}).items()
            },
        )

    async def read(self, profile: UserProfile) -> ProfileRead:
        data = self.to_write(profile)
        has_resume = bool(
            await self.session.scalar(
                select(func.count())
                .select_from(Resume)
                .where(Resume.user_id == profile.user_id, Resume.status == ResumeStatus.READY)
            )
        )
        return ProfileRead(
            **data.model_dump(),
            id=profile.id,
            source_resume_id=profile.source_resume_id,
            updated_at=profile.updated_at,
            completion=self.completion(data, has_resume=has_resume),
        )

    @staticmethod
    def completion(data: ProfileWrite, *, has_resume: bool) -> ProfileCompletion:
        p = data.personal_information
        s = data.professional_summary
        extra = data.additional_info
        checks = [
            ("name", "Full name", bool(p.full_name or (p.first_name and p.last_name)), 10),
            ("email", "Email", bool(p.email), 10),
            ("phone", "Phone number", bool(p.phone), 10),
            ("location", "Location", bool(p.location), 5),
            ("linkedin", "LinkedIn profile", bool(p.linkedin), 5),
            ("headline", "Current designation", bool(s.current_designation), 5),
            ("summary", "Professional summary", bool(s.summary), 5),
            ("experience", "Work experience", bool(data.experience), 15),
            ("education", "Education", bool(data.education), 10),
            ("skills", "Skills", any(getattr(data.skills, f) for f in Skills.model_fields), 10),
            ("resume", "Processed resume", has_resume, 10),
            (
                "additional",
                "Work authorization or notice period",
                bool(extra.work_authorization or extra.notice_period),
                5,
            ),
        ]
        items = [CompletionItem(key=k, label=lbl, done=d, weight=w) for k, lbl, d, w in checks]
        percentage = round(
            sum(i.weight for i in items if i.done) / sum(i.weight for i in items) * 100
        )
        done = {i.key: i.done for i in items}

        def status(*keys: str) -> str:
            hits = sum(done[k] for k in keys)
            return "complete" if hits == len(keys) else ("missing" if hits == 0 else "incomplete")

        unconfirmed = sum(1 for m in data.field_meta.values() if not m.is_confirmed) + sum(
            1 for attr in ITEM_MODELS for item in getattr(data, attr) if not item.is_confirmed
        )
        return ProfileCompletion(
            percentage=percentage,
            sections={
                "personal": status("name", "location"),
                "contact": status("email", "phone"),
                "experience": status("experience"),
                "education": status("education"),
                "skills": status("skills"),
                "resume": status("resume"),
                "additional": status("additional"),
            },
            items=items,
            unconfirmed_fields=unconfirmed,
        )
