import uuid
from datetime import UTC, date, datetime, timedelta
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, ConflictError
from app.db.models import AnswerUsage, Application, ApplicationStatus, Resume
from app.schemas.applications import (
    ApplicationCreate,
    ApplicationStats,
    ApplicationUpdate,
    DetectedApplication,
    WeekCount,
)

TRACKING_PARAMS = {
    "gh_src",
    "source",
    "src",
    "ref",
    "referrer",
    "lever-source",
    "lever-origin",
    "fbclid",
    "gclid",
}


def normalize_job_url(url: str) -> str:
    """Drop fragments and tracking parameters so one job maps to one application."""
    parts = urlsplit(url.strip())
    query = [
        (k, v)
        for k, v in parse_qsl(parts.query, keep_blank_values=True)
        if not k.lower().startswith("utm_") and k.lower() not in TRACKING_PARAMS
    ]
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(query), ""))


class ApplicationNotFoundError(AppError):
    status_code = 404
    code = "APPLICATION_NOT_FOUND"
    message = "Application not found."


class ApplicationService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _event(application: Application, status: ApplicationStatus, by: str) -> None:
        application.status = status
        application.status_history = [
            *(application.status_history or []),
            {"status": status.value, "at": datetime.now(UTC).isoformat(), "by": by},
        ]
        if status == ApplicationStatus.SUBMITTED and application.applied_at is None:
            application.applied_at = datetime.now(UTC)

    async def _primary_resume_id(self, user_id: uuid.UUID) -> uuid.UUID | None:
        return await self.session.scalar(
            select(Resume.id).where(Resume.user_id == user_id, Resume.is_primary.is_(True))
        )

    async def search(
        self, user_id: uuid.UUID, *, status: str | None = None, query: str | None = None
    ) -> list[Application]:
        statement = select(Application).where(Application.user_id == user_id)
        if status:
            statement = statement.where(Application.status == ApplicationStatus(status))
        if query:
            like = f"%{query.strip()}%"
            statement = statement.where(
                or_(Application.company_name.ilike(like), Application.job_title.ilike(like))
            )
        result = await self.session.execute(statement.order_by(Application.updated_at.desc()))
        return list(result.scalars())

    async def get(self, user_id: uuid.UUID, application_id: uuid.UUID) -> Application:
        application = await self.session.get(Application, application_id)
        if application is None or application.user_id != user_id:
            raise ApplicationNotFoundError()
        return application

    async def create(self, user_id: uuid.UUID, data: ApplicationCreate) -> Application:
        url = normalize_job_url(str(data.job_url))
        existing = await self.session.scalar(
            select(Application).where(Application.user_id == user_id, Application.job_url == url)
        )
        if existing is not None:
            raise ConflictError(
                "This job is already in your tracker.", details={"application_id": str(existing.id)}
            )
        application = Application(
            user_id=user_id,
            job_url=url,
            company_name=data.company_name,
            job_title=data.job_title,
            portal=data.portal,
            job_description=data.job_description,
            notes=data.notes,
            resume_id=data.resume_id or await self._primary_resume_id(user_id),
            source="manual",
            status_history=[],
            fields_detected=0,
            fields_filled=0,
        )
        self._event(application, ApplicationStatus(data.status), "user")
        self.session.add(application)
        await self.session.commit()
        return application

    async def update(
        self, user_id: uuid.UUID, application_id: uuid.UUID, data: ApplicationUpdate
    ) -> Application:
        application = await self.get(user_id, application_id)
        values = data.model_dump(exclude_unset=True)
        status = values.pop("status", None)
        if "resume_id" in values and values["resume_id"] is not None:
            resume = await self.session.get(Resume, values["resume_id"])
            if resume is None or resume.user_id != user_id:
                raise ApplicationNotFoundError("Resume not found.")
        for key, value in values.items():
            setattr(application, key, value)
        if status and status != application.status.value:
            self._event(application, ApplicationStatus(status), "user")
        application.updated_at = datetime.now(UTC)
        await self.session.commit()
        return application

    async def delete(self, user_id: uuid.UUID, application_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(user_id, application_id))
        await self.session.commit()

    async def record_detection(self, user_id: uuid.UUID, data: DetectedApplication) -> Application:
        """Create or update the application for a page the extension saw.

        Automatic updates never move status backwards and never mark anything as
        submitted: only the user can do that.
        """
        url = normalize_job_url(str(data.job_url))
        application = await self.session.scalar(
            select(Application).where(Application.user_id == user_id, Application.job_url == url)
        )
        if application is None:
            application = Application(
                user_id=user_id,
                job_url=url,
                resume_id=await self._primary_resume_id(user_id),
                source="extension",
                status_history=[],
                fields_detected=0,
                fields_filled=0,
            )
            self._event(application, ApplicationStatus.DETECTED, "extension")
            self.session.add(application)
        # Fill gaps but don't overwrite what the user edited.
        application.company_name = application.company_name or data.company_name
        application.job_title = application.job_title or data.job_title
        application.portal = application.portal or data.portal
        application.job_description = application.job_description or data.job_description
        application.fields_detected = max(application.fields_detected, data.fields_detected)
        application.fields_filled = max(application.fields_filled, data.fields_filled)
        if data.fields_filled > 0 and application.status == ApplicationStatus.DETECTED:
            self._event(application, ApplicationStatus.IN_PROGRESS, "extension")
        application.updated_at = datetime.now(UTC)
        await self.session.commit()
        return application

    async def answers_for(self, user_id: uuid.UUID, application_id: uuid.UUID) -> list[AnswerUsage]:
        result = await self.session.execute(
            select(AnswerUsage)
            .where(AnswerUsage.user_id == user_id, AnswerUsage.application_id == application_id)
            .order_by(AnswerUsage.created_at)
        )
        return list(result.scalars())

    async def stats(self, user_id: uuid.UUID, today: date | None = None) -> ApplicationStats:
        today = today or datetime.now(UTC).date()
        rows = await self.session.execute(
            select(Application.status, func.count())
            .where(Application.user_id == user_id)
            .group_by(Application.status)
        )
        by_status = {s.value: 0 for s in ApplicationStatus}
        for status, count in rows.all():
            by_status[status.value] = count
        total = sum(by_status.values())
        submitted = sum(by_status[s] for s in ("submitted", "interview", "offer", "rejected"))
        responses = sum(by_status[s] for s in ("interview", "offer", "rejected"))
        active = sum(by_status[s] for s in ("detected", "in_progress", "ready_to_submit"))

        week_start = today - timedelta(days=today.weekday())
        first_week = week_start - timedelta(weeks=7)
        created = await self.session.execute(
            select(Application.created_at).where(
                Application.user_id == user_id,
                Application.created_at >= datetime.combine(first_week, datetime.min.time(), UTC),
            )
        )
        weekly = {first_week + timedelta(weeks=i): 0 for i in range(8)}
        for (created_at,) in created.all():
            day = created_at.astimezone(UTC).date()
            weekly[day - timedelta(days=day.weekday())] += 1
        return ApplicationStats(
            total=total,
            by_status=by_status,
            active=active,
            submitted=submitted,
            responses=responses,
            response_rate=round(responses / submitted, 3) if submitted else None,
            this_week=weekly[week_start],
            weekly=[WeekCount(week_start=k, count=v) for k, v in sorted(weekly.items())],
        )
