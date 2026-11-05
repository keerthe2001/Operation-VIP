"""Resume processing orchestration: validate → extract → parse → persist → seed profile."""

import asyncio
import logging
import time
import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.models import Resume, ResumeStatus
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extract import extract_document
from app.resume_pipeline.parsing.parser import RuleBasedParser
from app.resume_pipeline.validation import sniff_kind
from app.services.profile import ProfileService
from app.storage.base import FileStorage, StorageError

logger = logging.getLogger(__name__)


class ResumeProcessor:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        storage: FileStorage,
        settings: Settings,
    ) -> None:
        self.sessionmaker = sessionmaker
        self.storage = storage
        self.settings = settings

    async def process(self, resume_id: uuid.UUID) -> None:
        started = time.perf_counter()
        async with self.sessionmaker() as session:
            resume = await session.get(Resume, resume_id)
            if resume is None:
                logger.warning("Resume %s no longer exists; skipping", resume_id)
                return
            try:
                await self._run(session, resume)
            except PipelineError as exc:
                logger.info("Resume %s failed: %s", resume_id, exc.code)
                await self._fail(session, resume, exc.code, exc.message)
            except Exception:
                logger.exception("Unexpected error while processing resume %s", resume_id)
                await self._fail(
                    session,
                    resume,
                    "PROCESSING_ERROR",
                    "We couldn't process this file. Try again, or upload a different format.",
                )
            finally:
                logger.info(
                    "Resume %s processed in %.0f ms (status=%s)",
                    resume_id,
                    (time.perf_counter() - started) * 1000,
                    resume.status,
                )

    async def _set_status(
        self, session: AsyncSession, resume: Resume, status: ResumeStatus
    ) -> None:
        resume.status = status
        await session.commit()

    async def _fail(self, session: AsyncSession, resume: Resume, code: str, message: str) -> None:
        await session.rollback()
        resume.status = ResumeStatus.FAILED
        resume.error_code = code
        resume.error_message = message[:500]
        resume.processed_at = datetime.now(UTC)
        await session.commit()

    async def _run(self, session: AsyncSession, resume: Resume) -> None:
        resume.error_code = None
        resume.error_message = None
        await self._set_status(session, resume, ResumeStatus.EXTRACTING)
        try:
            data = await self.storage.get(resume.storage_key)
        except StorageError as exc:
            raise PipelineError("STORAGE_ERROR", "The uploaded file could not be read.") from exc

        kind = sniff_kind(data)
        if kind is None:
            raise PipelineError("UNSUPPORTED_FILE_TYPE", "This file type isn't supported.")
        document, doc_class = await asyncio.to_thread(extract_document, kind, data)
        if not document.text.strip():
            raise PipelineError("NO_TEXT_FOUND", "We couldn't find any text in this file.")

        await self._set_status(session, resume, ResumeStatus.PARSING)
        parser = RuleBasedParser(
            default_phone_region=self.settings.default_phone_region, today=date.today()
        )
        parsed = await asyncio.to_thread(parser.parse, document.lines)

        resume.doc_class = doc_class
        resume.page_count = document.page_count
        resume.extracted_text = document.text
        resume.extracted_data = parsed.model_dump(mode="json")
        resume.extraction_meta = {
            "parser": parser.version,
            "method": document.method,
            "warnings": document.warnings,
            "ocr_confidence": document.ocr_confidence,
            "line_count": len(document.lines),
        }
        resume.status = ResumeStatus.READY
        resume.processed_at = datetime.now(UTC)
        await session.flush()

        # The first successfully parsed resume seeds an empty profile automatically.
        await ProfileService(session).seed_from_resume_if_empty(resume.user_id, resume)
        await session.commit()
