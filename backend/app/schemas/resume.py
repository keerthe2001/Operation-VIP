import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict

from app.db.models import DocumentClass, ResumeStatus


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
