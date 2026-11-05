"""Chooses the extraction strategy for a validated file (Step 2 + Step 3 of the pipeline)."""

from app.db.models import DocumentClass
from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extractors.docx import extract_docx
from app.resume_pipeline.extractors.pdf import extract_pdf
from app.resume_pipeline.types import ExtractedDocument, FileKind


def extract_document(kind: FileKind, data: bytes) -> tuple[ExtractedDocument, DocumentClass]:
    """Blocking (CPU-bound); call through `asyncio.to_thread`."""
    if kind == "pdf":
        document, textless_pages = extract_pdf(data)
        if textless_pages and len(textless_pages) == document.page_count:
            raise PipelineError(
                errors.NO_TEXT,
                "This PDF looks scanned. Scanned resumes need OCR, which isn't available yet.",
            )
        if textless_pages:
            document.warnings.append(f"Pages without selectable text: {textless_pages}")
        return document, DocumentClass.TEXT_PDF
    if kind == "docx":
        return extract_docx(data), DocumentClass.DOCX
    raise PipelineError(
        errors.UNSUPPORTED_TYPE, "This file type can't be processed yet. Upload a PDF or DOCX."
    )
