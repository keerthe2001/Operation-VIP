import uuid

from fastapi import APIRouter, status

from app.api.deps import CurrentUser, SessionDep
from app.schemas.answers import (
    AnswerTemplate,
    AnswerUsageCreate,
    AnswerUsageRead,
    SavedAnswerCreate,
    SavedAnswerRead,
    SavedAnswerUpdate,
)
from app.services.answer_templates import PLACEHOLDERS, STARTER_TEMPLATES
from app.services.answers import AnswerService

router = APIRouter(prefix="/answers", tags=["answers"])


@router.get("", response_model=list[SavedAnswerRead])
async def list_answers(user: CurrentUser, session: SessionDep) -> list[SavedAnswerRead]:
    return [SavedAnswerRead.model_validate(a) for a in await AnswerService(session).list(user.id)]


@router.post("", response_model=SavedAnswerRead, status_code=status.HTTP_201_CREATED)
async def create_answer(
    payload: SavedAnswerCreate, user: CurrentUser, session: SessionDep
) -> SavedAnswerRead:
    return SavedAnswerRead.model_validate(await AnswerService(session).create(user.id, payload))


@router.get("/templates", response_model=list[AnswerTemplate])
async def starter_templates() -> list[AnswerTemplate]:
    return STARTER_TEMPLATES


@router.get("/placeholders", response_model=dict[str, str])
async def placeholders() -> dict[str, str]:
    """Placeholders an answer can use, e.g. {company}, with a description."""
    return PLACEHOLDERS


@router.post("/usages", response_model=AnswerUsageRead, status_code=status.HTTP_201_CREATED)
async def record_usage(
    payload: AnswerUsageCreate, user: CurrentUser, session: SessionDep
) -> AnswerUsageRead:
    usage = await AnswerService(session).record_usage(user.id, payload)
    return AnswerUsageRead.model_validate(usage)


@router.patch("/{answer_id}", response_model=SavedAnswerRead)
async def update_answer(
    answer_id: uuid.UUID, payload: SavedAnswerUpdate, user: CurrentUser, session: SessionDep
) -> SavedAnswerRead:
    answer = await AnswerService(session).update(user.id, answer_id, payload)
    return SavedAnswerRead.model_validate(answer)


@router.delete("/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_answer(answer_id: uuid.UUID, user: CurrentUser, session: SessionDep) -> None:
    await AnswerService(session).delete(user.id, answer_id)
