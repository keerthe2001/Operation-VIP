"""Resume processing orchestration: validate → extract → parse → persist → seed profile."""

import asyncio
import logging
import time
import uuid
from datetime import UTC, date, datetime

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.config import Settings
from app.db.models import Resume, ResumeStatus
from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.ocr import create_ocr
from app.resume_pipeline.parsing.parser import RuleBasedParser
from app.resume_pipeline.scanning import MalwareScanner, ScannerUnavailableError, create_scanner
from app.resume_pipeline.validation import sniff_kind
from app.schemas.resume_data import ResumeData
from app.services.profile import ProfileService
from app.storage.base import FileStorage, StorageError

logger = logging.getLogger(__name__)


class ResumeProcessor:
    def __init__(
        self,
        sessionmaker: async_sessionmaker[AsyncSession],
        storage: FileStorage,
        settings: Settings,
        *,
        scanner: MalwareScanner | None = None,
        extractor: DocumentExtractor | None = None,
    ) -> None:
        self.sessionmaker = sessionmaker
        self.storage = storage
        self.settings = settings
        self.scanner = scanner or create_scanner(
            settings.malware_scanner,
            host=settings.clamd_host,
            port=settings.clamd_port,
            socket_path=settings.clamd_socket,
        )
        self.extractor = extractor or DocumentExtractor(
            ocr=create_ocr(settings.ocr_provider, settings.ocr_languages),
            ocr_dpi=settings.ocr_dpi,
            ocr_max_pages=settings.ocr_max_pages,
            libreoffice_binary=settings.libreoffice_binary,
        )

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

    async def _scan(self, resume: Resume, data: bytes) -> None:
        try:
            result = await self.scanner.scan(data)
        except ScannerUnavailableError as exc:
            logger.error("Malware scanner unavailable: %s", exc)
            if self.settings.malware_scan_required:
                raise PipelineError(
                    errors.SCAN_UNAVAILABLE,
                    "We couldn't check this file for viruses right now. "
                    "Try again in a few minutes.",
                ) from exc
            return
        if not result.clean:
            logger.warning("Malware detected in resume %s: %s", resume.id, result.signature)
            try:
                await self.storage.delete(resume.storage_key)
            except StorageError:
                logger.exception("Could not delete infected file %s", resume.storage_key)
            raise PipelineError(
                errors.MALWARE,
                "This file was flagged by our virus scanner and has been deleted.",
            )

    @staticmethod
    def _discount_ocr(parsed: ResumeData, ocr_confidence: float) -> ResumeData:
        """Values read by OCR are less certain than selectable text."""
        factor = max(0.5, min(1.0, ocr_confidence / 100))
        for meta in parsed.field_meta.values():
            meta.confidence = round(meta.confidence * factor, 2)
        for section in (
            parsed.experience,
            parsed.education,
            parsed.projects,
            parsed.certifications,
        ):
            for item in section:
                if item.confidence is not None:
                    item.confidence = round(item.confidence * factor, 2)
        return parsed

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
        await self._set_status(session, resume, ResumeStatus.SCANNING)
        try:
            data = await self.storage.get(resume.storage_key)
        except StorageError as exc:
            raise PipelineError("STORAGE_ERROR", "The uploaded file could not be read.") from exc

        await self._scan(resume, data)

        kind = sniff_kind(data)
        if kind is None:
            raise PipelineError(errors.UNSUPPORTED_TYPE, "This file type isn't supported.")
        await self._set_status(session, resume, ResumeStatus.EXTRACTING)
        document, doc_class = await asyncio.to_thread(self.extractor.extract, kind, data)
        if not document.text.strip():
            raise PipelineError("NO_TEXT_FOUND", "We couldn't find any text in this file.")

        await self._set_status(session, resume, ResumeStatus.PARSING)
        parser = RuleBasedParser(
            default_phone_region=self.settings.default_phone_region, today=date.today()
        )
        parsed = await asyncio.to_thread(parser.parse, document.lines)
        if document.ocr_confidence is not None:
            parsed = self._discount_ocr(parsed, document.ocr_confidence)

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
