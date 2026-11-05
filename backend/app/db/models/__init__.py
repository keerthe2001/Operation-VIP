"""Import every model here so Alembic sees the complete metadata."""

from app.db.models.answer import AnswerSource, AnswerUsage, SavedAnswer
from app.db.models.profile import Certification, Education, Project, UserProfile, WorkExperience
from app.db.models.resume import DocumentClass, Resume, ResumeStatus
from app.db.models.user import RefreshToken, TokenClient, User

__all__ = [
    "AnswerSource",
    "AnswerUsage",
    "Certification",
    "DocumentClass",
    "Education",
    "Project",
    "RefreshToken",
    "Resume",
    "ResumeStatus",
    "SavedAnswer",
    "TokenClient",
    "User",
    "UserProfile",
    "WorkExperience",
]
