from fastapi import APIRouter, Depends, Request, Response, status

from app.api.deps import CurrentUser, SessionDep, SettingsDep
from app.core.config import Settings
from app.core.errors import InvalidTokenError
from app.core.rate_limit import rate_limit
from app.db.models import TokenClient
from app.schemas.auth import (
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserRead,
)
from app.services.auth import AuthService, IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])

COOKIE_PATH = "/api/v1/auth"


def _auth_limit(request: Request) -> int:
    settings: Settings = request.app.state.settings
    return settings.rate_limit_auth_per_minute


def _respond(issued: IssuedTokens, response: Response, settings: Settings) -> TokenResponse:
    body = TokenResponse(
        access_token=issued.access_token,
        expires_at=issued.access_expires_at,
        user=UserRead.model_validate(issued.user),
    )
    if issued.client is TokenClient.EXTENSION:
        body.refresh_token = issued.refresh_token
    else:
        response.set_cookie(
            settings.refresh_cookie_name,
            issued.refresh_token,
            expires=issued.refresh_expires_at,
            path=COOKIE_PATH,
            httponly=True,
            secure=settings.cookie_secure,
            samesite="lax",
        )
    return body


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit("auth:register", _auth_limit))],
)
async def register(
    payload: RegisterRequest, response: Response, session: SessionDep, settings: SettingsDep
) -> TokenResponse:
    issued = await AuthService(session, settings).register(
        email=payload.email,
        password=payload.password,
        full_name=payload.full_name,
        client=TokenClient(payload.client),
    )
    return _respond(issued, response, settings)


@router.post(
    "/login",
    response_model=TokenResponse,
    dependencies=[Depends(rate_limit("auth:login", _auth_limit))],
)
async def login(
    payload: LoginRequest, response: Response, session: SessionDep, settings: SettingsDep
) -> TokenResponse:
    issued = await AuthService(session, settings).login(
        email=payload.email, password=payload.password, client=TokenClient(payload.client)
    )
    return _respond(issued, response, settings)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    request: Request,
    payload: RefreshRequest | None = None,
) -> TokenResponse:
    raw = (payload.refresh_token if payload else None) or request.cookies.get(
        settings.refresh_cookie_name
    )
    if not raw:
        raise InvalidTokenError()
    issued = await AuthService(session, settings).refresh(raw)
    return _respond(issued, response, settings)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: SessionDep,
    settings: SettingsDep,
    request: Request,
    payload: RefreshRequest | None = None,
) -> None:
    raw = (payload.refresh_token if payload else None) or request.cookies.get(
        settings.refresh_cookie_name
    )
    if raw:
        await AuthService(session, settings).logout(raw)
    response.delete_cookie(settings.refresh_cookie_name, path=COOKIE_PATH)


@router.get("/me", response_model=UserRead)
async def me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)
