import hashlib
import logging
import uuid
from pathlib import PurePath

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ConflictError
from app.db.models import Resume, ResumeStatus
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.validation import validate_upload
from app.storage.base import FileStorage, StorageError

logger = logging.getLogger(__name__)


class ResumeNotFoundError(AppError):
    status_code = 404
    code = "RESUME_NOT_FOUND"
    message = "Resume not found."


class InvalidUploadError(AppError):
    status_code = 422
    code = "INVALID_UPLOAD"


class StorageUnavailableError(AppError):
    status_code = 503
    code = "STORAGE_UNAVAILABLE"
    message = "File storage is temporarily unavailable. Please try again."


class ResumeService:
    def __init__(self, session: AsyncSession, storage: FileStorage, settings: Settings) -> None:
        self.session = session
        self.storage = storage
        self.settings = settings

    async def list(self, user_id: uuid.UUID) -> list[Resume]:
        result = await self.session.execute(
            select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc())
        )
        return list(result.scalars())

    async def get(self, user_id: uuid.UUID, resume_id: uuid.UUID) -> Resume:
        resume = await self.session.get(Resume, resume_id)
        if resume is None or resume.user_id != user_id:
            raise ResumeNotFoundError()
        return resume

    async def upload(self, user_id: uuid.UUID, file_name: str | None, data: bytes) -> Resume:
        try:
            validated = validate_upload(
                file_name, data, max_bytes=self.settings.max_upload_mb * 1024 * 1024
            )
        except PipelineError as exc:
            error = InvalidUploadError(exc.message)
            error.code = exc.code
            raise error from exc

        digest = hashlib.sha256(data).hexdigest()
        existing = await self.session.scalar(
            select(Resume).where(Resume.user_id == user_id, Resume.sha256 == digest)
        )
        if existing is not None:
            raise ConflictError(
                "You've already uploaded this file.",
                details={"resume_id": str(existing.id)},
            )

        resume_id = uuid.uuid4()
        extension = PurePath(validated.file_name).suffix.lower()
        key = f"users/{user_id}/resumes/{resume_id}{extension}"
        try:
            await self.storage.put(key, data, validated.mime_type)
        except StorageError as exc:
            logger.exception("Storage failure while uploading resume")
            raise StorageUnavailableError() from exc

        # The newest upload becomes the primary resume.
        await self.session.execute(
            update(Resume).where(Resume.user_id == user_id).values(is_primary=False)
        )
        resume = Resume(
            id=resume_id,
            user_id=user_id,
            file_name=validated.file_name,
            storage_key=key,
            mime_type=validated.mime_type,
            size_bytes=len(data),
            sha256=digest,
            status=ResumeStatus.UPLOADED,
            is_primary=True,
        )
        self.session.add(resume)
        await self.session.commit()
        logger.info("Resume uploaded id=%s size=%s kind=%s", resume.id, len(data), validated.kind)
        return resume

    async def mark_for_reprocessing(self, user_id: uuid.UUID, resume_id: uuid.UUID) -> Resume:
        resume = await self.get(user_id, resume_id)
        resume.status = ResumeStatus.UPLOADED
        resume.error_code = None
        resume.error_message = None
        await self.session.commit()
        return resume

    async def read_file(self, user_id: uuid.UUID, resume_id: uuid.UUID) -> tuple[Resume, bytes]:
        resume = await self.get(user_id, resume_id)
        try:
            return resume, await self.storage.get(resume.storage_key)
        except StorageError as exc:
            raise StorageUnavailableError() from exc

    async def delete(self, user_id: uuid.UUID, resume_id: uuid.UUID) -> None:
        resume = await self.get(user_id, resume_id)
        was_primary = resume.is_primary
        await self.session.delete(resume)
        await self.session.flush()
        if was_primary:
            newest = await self.session.scalar(
                select(Resume).where(Resume.user_id == user_id).order_by(Resume.created_at.desc())
            )
            if newest is not None:
                newest.is_primary = True
        await self.session.commit()
        try:
            await self.storage.delete(resume.storage_key)
        except StorageError:
            logger.warning("Could not delete stored file %s", resume.storage_key)
