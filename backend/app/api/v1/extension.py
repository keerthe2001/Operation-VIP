"""Endpoints used by the browser extension."""

import hashlib
from datetime import UTC, datetime

from fastapi import APIRouter, Request, Response
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep, SettingsDep
from app.db.models import Resume, TokenClient
from app.schemas.extension import ExtensionProfile, HandoffResponse
from app.schemas.resume import ResumeRead
from app.services.auth import AuthService
from app.services.profile import ProfileService

router = APIRouter(prefix="/extension", tags=["extension"])


@router.get(
    "/profile", response_model=ExtensionProfile, responses={304: {"description": "Unchanged"}}
)
async def extension_profile(
    request: Request, response: Response, user: CurrentUser, session: SessionDep
) -> ExtensionProfile | Response:
    """Profile + primary resume. Supports `If-None-Match` so polling is cheap."""
    service = ProfileService(session)
    profile = await service.get_or_create(user.id)
    await session.commit()
    primary = await session.scalar(
        select(Resume).where(Resume.user_id == user.id, Resume.is_primary.is_(True))
    )
    stamp = f"{profile.id}:{profile.updated_at.isoformat()}"
    if primary is not None:
        stamp += f":{primary.id}:{primary.status}:{primary.processed_at}"
    etag = f'W/"{hashlib.sha256(stamp.encode()).hexdigest()[:32]}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag})
    response.headers["ETag"] = etag
    response.headers["Cache-Control"] = "private, no-cache"
    return ExtensionProfile(
        profile=await service.read(profile),
        primary_resume=ResumeRead.model_validate(primary) if primary else None,
        synced_at=datetime.now(UTC),
    )


@router.post("/handoff", response_model=HandoffResponse)
async def handoff(user: CurrentUser, session: SessionDep, settings: SettingsDep) -> HandoffResponse:
    """Issue an extension session for the signed-in web user.

    The web app passes the returned refresh token straight to the extension through
    Chrome's `externally_connectable` messaging; it is never stored by the web app.
    """
    issued = await AuthService(session, settings).issue_for(user, client=TokenClient.EXTENSION)
    return HandoffResponse(refresh_token=issued.refresh_token, user_id=user.id)
