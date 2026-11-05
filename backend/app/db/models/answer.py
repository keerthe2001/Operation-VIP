import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Enum, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class SavedAnswer(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    """A reusable answer with {placeholders}, written by the user."""

    __tablename__ = "saved_answers"
    __table_args__ = (Index("ix_saved_answers_user_id_category", "user_id", "category"),)

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category: Mapped[str] = mapped_column(String(50))
    question_text: Mapped[str] = mapped_column(String(500))
    answer_template: Mapped[str] = mapped_column(Text)
    # Alternative wordings (e.g. a short version) cycled with "Next variant".
    variants: Mapped[list[str]] = mapped_column(JSONB, default=list)
    usage_count: Mapped[int] = mapped_column(default=0)


class AnswerSource(enum.StrEnum):
    LIBRARY = "library"
    MANUAL = "manual"
    AI = "ai"  # reserved for the future AI answer engine


class AnswerUsage(UUIDPrimaryKeyMixin, Base):
    """What was inserted into which application (for history and future suggestions)."""

    __tablename__ = "answer_usages"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    saved_answer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("saved_answers.id", ondelete="SET NULL")
    )
    question_text: Mapped[str] = mapped_column(String(500))
    final_answer: Mapped[str] = mapped_column(Text)
    source: Mapped[AnswerSource] = mapped_column(
        Enum(AnswerSource, name="answer_source", values_callable=lambda e: [m.value for m in e])
    )
    company: Mapped[str | None] = mapped_column(String(200))
    job_title: Mapped[str | None] = mapped_column(String(300))
    url: Mapped[str | None] = mapped_column(String(2048))
    context: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
