import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.db.models import Resume
from app.schemas.applications import (
    AnswerUsageSummary,
    ApplicationCreate,
    ApplicationDetail,
    ApplicationRead,
    ApplicationStats,
    ApplicationUpdate,
    StatusValue,
)
from app.services.applications import ApplicationService

router = APIRouter(prefix="/applications", tags=["applications"])


@router.get("", response_model=list[ApplicationRead])
async def list_applications(
    user: CurrentUser,
    session: SessionDep,
    status_filter: Annotated[StatusValue | None, Query(alias="status")] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
) -> list[ApplicationRead]:
    items = await ApplicationService(session).search(user.id, status=status_filter, query=q)
    return [ApplicationRead.model_validate(a) for a in items]


@router.post("", response_model=ApplicationRead, status_code=status.HTTP_201_CREATED)
async def create_application(
    payload: ApplicationCreate, user: CurrentUser, session: SessionDep
) -> ApplicationRead:
    return ApplicationRead.model_validate(
        await ApplicationService(session).create(user.id, payload)
    )


@router.get("/stats", response_model=ApplicationStats)
async def application_stats(user: CurrentUser, session: SessionDep) -> ApplicationStats:
    return await ApplicationService(session).stats(user.id)


@router.get("/{application_id}", response_model=ApplicationDetail)
async def get_application(
    application_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> ApplicationDetail:
    service = ApplicationService(session)
    application = await service.get(user.id, application_id)
    resume_name = (
        await session.scalar(select(Resume.file_name).where(Resume.id == application.resume_id))
        if application.resume_id
        else None
    )
    answers = await service.answers_for(user.id, application_id)
    return ApplicationDetail(
        **ApplicationRead.model_validate(application).model_dump(),
        resume_file_name=resume_name,
        answers=[AnswerUsageSummary.model_validate(a) for a in answers],
    )


@router.patch("/{application_id}", response_model=ApplicationRead)
async def update_application(
    application_id: uuid.UUID, payload: ApplicationUpdate, user: CurrentUser, session: SessionDep
) -> ApplicationRead:
    application = await ApplicationService(session).update(user.id, application_id, payload)
    return ApplicationRead.model_validate(application)


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: uuid.UUID, user: CurrentUser, session: SessionDep
) -> None:
    await ApplicationService(session).delete(user.id, application_id)
