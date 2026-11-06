import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator

from app.db.models import DocumentClass, ResumeStatus
from app.resume_pipeline.parsing.parser import PARSER_VERSION


class ResumeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    file_name: str
    mime_type: str
    size_bytes: int
    doc_class: DocumentClass | None
    status: ResumeStatus
    error_code: str | None
    error_message: str | None
    page_count: int | None
    is_primary: bool
    created_at: datetime
    processed_at: datetime | None
    # Surfaced from extraction_meta so clients can flag OCR'd or partial extractions.
    ocr_confidence: float | None = None
    warnings: list[str] = []
    # True when a newer parser exists than the one that read this file; re-processing the
    # resume picks up the parser's latest fixes.
    parser_outdated: bool = False

    @model_validator(mode="before")
    @classmethod
    def _expose_meta(cls, data: Any) -> Any:
        if isinstance(data, dict):
            return data
        meta = getattr(data, "extraction_meta", None) or {}
        values = {name: getattr(data, name) for name in cls.model_fields if hasattr(data, name)}
        values["ocr_confidence"] = meta.get("ocr_confidence")
        values["warnings"] = list(meta.get("warnings") or [])
        values["parser_outdated"] = (
            getattr(data, "status", None) == ResumeStatus.READY
            and meta.get("parser") != PARSER_VERSION
        )
        return values


class ResumeDetail(ResumeRead):
    extracted_text: str | None
    extracted_data: dict[str, Any] | None
    extraction_meta: dict[str, Any] | None


class ResumeStatusRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: ResumeStatus
    error_code: str | None
    error_message: str | None
    processed_at: datetime | None
