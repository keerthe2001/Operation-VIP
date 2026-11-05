import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.profile import ProfileRead
from app.schemas.resume import ResumeRead


class ExtensionProfile(BaseModel):
    """Everything the extension needs to fill forms, fetched in one request."""

    profile: ProfileRead
    primary_resume: ResumeRead | None
    synced_at: datetime


class HandoffResponse(BaseModel):
    refresh_token: str
    user_id: uuid.UUID
