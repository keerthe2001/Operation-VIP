import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDPrimaryKeyMixin, utcnow


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


class DocumentClass(enum.StrEnum):
    TEXT_PDF = "text_pdf"
    SCANNED_PDF = "scanned_pdf"
    IMAGE = "image"
    DOCX = "docx"
    DOC = "doc"


class ResumeStatus(enum.StrEnum):
    UPLOADED = "uploaded"
    SCANNING = "scanning"
    EXTRACTING = "extracting"
    PARSING = "parsing"
    READY = "ready"
    FAILED = "failed"


class Resume(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "resumes"
    __table_args__ = (
        UniqueConstraint("user_id", "sha256", name="uq_resumes_user_id_sha256"),
        Index("ix_resumes_user_id_created_at", "user_id", "created_at"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    file_name: Mapped[str] = mapped_column(String(255))
    storage_key: Mapped[str] = mapped_column(String(512))
    mime_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    sha256: Mapped[str] = mapped_column(String(64))
    doc_class: Mapped[DocumentClass | None] = mapped_column(_enum(DocumentClass, "document_class"))
    status: Mapped[ResumeStatus] = mapped_column(
        _enum(ResumeStatus, "resume_status"), default=ResumeStatus.UPLOADED
    )
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(String(500))
    extracted_text: Mapped[str | None] = mapped_column(Text)
    page_count: Mapped[int | None]
    # Raw parser output. Never edited: the user's edits live in the profile.
    extracted_data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    extraction_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    is_primary: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
