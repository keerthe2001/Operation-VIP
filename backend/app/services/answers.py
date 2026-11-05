import uuid

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError
from app.db.models import AnswerSource, AnswerUsage, Application, SavedAnswer
from app.schemas.answers import AnswerUsageCreate, SavedAnswerCreate, SavedAnswerUpdate

MAX_ANSWERS = 200


class AnswerNotFoundError(AppError):
    status_code = 404
    code = "ANSWER_NOT_FOUND"
    message = "Saved answer not found."


class AnswerLimitError(AppError):
    status_code = 409
    code = "ANSWER_LIMIT"
    message = f"You can save up to {MAX_ANSWERS} answers."


class AnswerService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list(self, user_id: uuid.UUID) -> list[SavedAnswer]:
        result = await self.session.execute(
            select(SavedAnswer)
            .where(SavedAnswer.user_id == user_id)
            .order_by(SavedAnswer.category, SavedAnswer.created_at)
        )
        return list(result.scalars())

    async def get(self, user_id: uuid.UUID, answer_id: uuid.UUID) -> SavedAnswer:
        answer = await self.session.get(SavedAnswer, answer_id)
        if answer is None or answer.user_id != user_id:
            raise AnswerNotFoundError()
        return answer

    async def create(self, user_id: uuid.UUID, data: SavedAnswerCreate) -> SavedAnswer:
        if len(await self.list(user_id)) >= MAX_ANSWERS:
            raise AnswerLimitError()
        answer = SavedAnswer(user_id=user_id, usage_count=0, **data.model_dump())
        self.session.add(answer)
        await self.session.commit()
        await self.session.refresh(answer)
        return answer

    async def update(
        self, user_id: uuid.UUID, answer_id: uuid.UUID, data: SavedAnswerUpdate
    ) -> SavedAnswer:
        answer = await self.get(user_id, answer_id)
        for key, value in data.model_dump(exclude_unset=True).items():
            if value is not None:
                setattr(answer, key, value)
        await self.session.commit()
        await self.session.refresh(answer)
        return answer

    async def delete(self, user_id: uuid.UUID, answer_id: uuid.UUID) -> None:
        await self.session.delete(await self.get(user_id, answer_id))
        await self.session.commit()

    async def record_usage(self, user_id: uuid.UUID, data: AnswerUsageCreate) -> AnswerUsage:
        if data.saved_answer_id is not None:
            await self.get(user_id, data.saved_answer_id)  # ownership check
            await self.session.execute(
                update(SavedAnswer)
                .where(SavedAnswer.id == data.saved_answer_id)
                .values(usage_count=SavedAnswer.usage_count + 1)
            )
        application_id = data.application_id
        if application_id is not None:
            application = await self.session.get(Application, application_id)
            if application is None or application.user_id != user_id:
                application_id = None  # never link to someone else's application
        usage = AnswerUsage(
            user_id=user_id,
            saved_answer_id=data.saved_answer_id,
            application_id=application_id,
            question_text=data.question_text,
            final_answer=data.final_answer,
            source=AnswerSource(data.source),
            company=data.company,
            job_title=data.job_title,
            url=data.url,
            context={},
        )
        self.session.add(usage)
        await self.session.commit()
        await self.session.refresh(usage)
        return usage
