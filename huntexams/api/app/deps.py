from datetime import UTC, datetime
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.core import api_error, hash_token
from app.models import Role, Session, User


def get_settings_dep(request: Request) -> Settings:
    return request.app.state.settings


async def get_session(request: Request):  # type: ignore[no-untyped-def]
    async for s in request.app.state.db.session():
        yield s


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
DbDep = Annotated[AsyncSession, Depends(get_session)]


async def _user_from_cookie(request: Request, db: AsyncSession) -> User | None:
    settings: Settings = request.app.state.settings
    raw = request.cookies.get(settings.session_cookie_name)
    if not raw:
        return None
    row = await db.scalar(select(Session).where(Session.token_hash == hash_token(raw)))
    if not row or row.expires_at <= datetime.now(UTC):
        return None
    return await db.get(User, row.user_id)


async def optional_user(request: Request, db: DbDep) -> User | None:
    return await _user_from_cookie(request, db)


async def current_user(request: Request, db: DbDep) -> User:
    user = await _user_from_cookie(request, db)
    if not user:
        raise api_error(401, "Please log in to continue.", "unauthenticated")
    return user


async def admin_user(user: Annotated[User, Depends(current_user)]) -> User:
    if user.role != Role.ADMIN:
        raise api_error(403, "Admins only.", "forbidden")
    return user


OptionalUser = Annotated[User | None, Depends(optional_user)]
CurrentUser = Annotated[User, Depends(current_user)]
AdminUser = Annotated[User, Depends(admin_user)]
