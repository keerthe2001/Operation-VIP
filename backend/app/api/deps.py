from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import InvalidTokenError, NotAuthenticatedError
from app.core.security import decode_access_token
from app.db.models import User
from app.repositories.users import UserRepository


def get_settings_dep(request: Request) -> Settings:
    settings: Settings = request.app.state.settings
    return settings


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    async for session in request.app.state.db.session():
        yield session


def get_redis(request: Request) -> Redis:
    redis: Redis = request.app.state.redis
    return redis


SettingsDep = Annotated[Settings, Depends(get_settings_dep)]
SessionDep = Annotated[AsyncSession, Depends(get_session)]
RedisDep = Annotated[Redis, Depends(get_redis)]

_bearer = HTTPBearer(auto_error=False)


async def get_current_user(
    session: SessionDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None:
        raise NotAuthenticatedError()
    user_id = decode_access_token(
        credentials.credentials, secret=settings.jwt_secret, algorithm=settings.jwt_algorithm
    )
    user = await UserRepository(session).get(user_id)
    if user is None or not user.is_active:
        raise InvalidTokenError()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]
