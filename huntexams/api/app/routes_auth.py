"""Registration, login, logout, password reset and the learner's own profile."""

import logging
from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import delete, func, select

from app.config import Settings
from app.core import api_error, hash_password, hash_token, new_token, rate_limit, verify_password
from app.deps import CurrentUser, DbDep, OptionalUser, SettingsDep
from app.learning import plan_for, published_levels, published_path
from app.models import PasswordReset, Role, Session, StudentProfile, User

logger = logging.getLogger("huntexams.auth")
router = APIRouter(prefix="/auth", tags=["auth"])


def _auth_limit(request: Request) -> int:
    return request.app.state.settings.rate_limit_auth_per_minute


AuthLimit = Depends(rate_limit("auth", _auth_limit))


class RegisterIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name can't be empty")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=10, max_length=200)


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    skill_level: Literal["beginner", "intermediate", "advanced"] | None = None
    time_budget: Literal["30m", "1h", "2h", "weekends"] | None = None
    explain_mode: Literal["simple", "eng"] | None = None
    autoplay: bool | None = None
    complete_onboarding: bool = False


def user_out(user: User) -> dict:
    p = user.profile
    return {
        "id": str(user.id),
        "name": user.name,
        "email": user.email,
        "role": user.role.value,
        "plan": user.plan.value,
        "profile": {
            "career_path": p.career_path if p else "agentic-ai-engineer",
            "skill_level": p.skill_level if p else None,
            "time_budget": p.time_budget if p else None,
            "explain_mode": p.explain_mode if p else "simple",
            "autoplay": p.autoplay if p else True,
            "onboarded": bool(p and p.onboarded_at),
        },
    }


async def _start_session(db, user: User, response: Response, settings: Settings) -> None:  # type: ignore[no-untyped-def]
    raw = new_token()
    expires = datetime.now(UTC) + timedelta(days=settings.session_ttl_days)
    db.add(Session(user_id=user.id, token_hash=hash_token(raw), expires_at=expires))
    response.set_cookie(
        settings.session_cookie_name,
        raw,
        expires=expires,
        path="/",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
    )


def _maybe_admin(user: User, settings: Settings) -> None:
    if user.email.lower() in {e.lower() for e in settings.admin_emails}:
        user.role = Role.ADMIN


@router.post("/register", status_code=201, dependencies=[AuthLimit])
async def register(body: RegisterIn, response: Response, db: DbDep, settings: SettingsDep):  # type: ignore[no-untyped-def]
    email = body.email.lower()
    if await db.scalar(select(User.id).where(func.lower(User.email) == email)):
        raise api_error(
            409, "An account with this email already exists. Try logging in.", "email_taken"
        )
    user = User(email=email, name=body.name, password_hash=hash_password(body.password))
    _maybe_admin(user, settings)
    db.add(user)
    await db.flush()
    db.add(StudentProfile(user_id=user.id))
    await _start_session(db, user, response, settings)
    await db.commit()
    await db.refresh(user, ["profile"])
    return user_out(user)


@router.post("/login", dependencies=[AuthLimit])
async def login(body: LoginIn, response: Response, db: DbDep, settings: SettingsDep):  # type: ignore[no-untyped-def]
    user = await db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if not verify_password(body.password, user.password_hash if user else None) or not user:
        raise api_error(401, "That email and password don't match.", "bad_credentials")
    _maybe_admin(user, settings)
    await _start_session(db, user, response, settings)
    await db.commit()
    return user_out(user)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: DbDep, settings: SettingsDep) -> None:
    raw = request.cookies.get(settings.session_cookie_name)
    if raw:
        await db.execute(delete(Session).where(Session.token_hash == hash_token(raw)))
        await db.commit()
    response.delete_cookie(settings.session_cookie_name, path="/")


@router.post("/forgot", dependencies=[AuthLimit])
async def forgot(body: ForgotIn, db: DbDep, settings: SettingsDep) -> dict:
    user = await db.scalar(select(User).where(func.lower(User.email) == body.email.lower()))
    if user:
        raw = new_token()
        db.add(
            PasswordReset(
                user_id=user.id,
                token_hash=hash_token(raw),
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        await db.commit()
        link = f"{settings.public_site_url}/reset-password?token={raw}"
        # No email provider is configured in Release 1. In development the link is logged so
        # the flow can be tested; production must wire a provider before enabling this page.
        if settings.app_env != "production":
            logger.warning("Password reset link for %s: %s", user.email, link)
    return {"message": "If that email has an account, a reset link is on its way."}


@router.post("/reset", dependencies=[AuthLimit])
async def reset(body: ResetIn, response: Response, db: DbDep, settings: SettingsDep):  # type: ignore[no-untyped-def]
    row = await db.scalar(
        select(PasswordReset).where(PasswordReset.token_hash == hash_token(body.token))
    )
    if not row or row.used_at or row.expires_at <= datetime.now(UTC):
        raise api_error(400, "This reset link has expired. Ask for a new one.", "bad_token")
    user = await db.get(User, row.user_id)
    assert user is not None  # noqa: S101 - FK guarantees it
    user.password_hash = hash_password(body.password)
    row.used_at = datetime.now(UTC)
    await db.execute(delete(Session).where(Session.user_id == user.id))
    await _start_session(db, user, response, settings)
    await db.commit()
    return user_out(user)


me = APIRouter(prefix="/me", tags=["me"])


@me.get("")
async def get_me(user: CurrentUser) -> dict:
    return user_out(user)


@router.get("/session")
async def session_info(user: OptionalUser) -> dict:
    """Who is signed in, if anyone. Never 401s, so logged-out page loads stay quiet."""
    return {"user": user_out(user) if user else None}


@me.patch("")
async def update_me(body: ProfileIn, user: CurrentUser, db: DbDep) -> dict:
    profile = user.profile
    if profile is None:
        profile = StudentProfile(user_id=user.id)
        db.add(profile)
        user.profile = profile
    if body.name is not None:
        user.name = " ".join(body.name.split())
    for field in ("skill_level", "time_budget", "explain_mode", "autoplay"):
        value = getattr(body, field)
        if value is not None:
            setattr(profile, field, value)
    if body.complete_onboarding:
        if not profile.skill_level or not profile.time_budget:
            raise api_error(422, "Answer all three questions first.", "incomplete")
        profile.onboarded_at = datetime.now(UTC)
        if body.explain_mode is None:
            profile.explain_mode = "simple" if profile.skill_level == "beginner" else "eng"
    await db.commit()
    await db.refresh(user, ["profile"])
    return user_out(user)


@me.get("/plan-preview")
async def plan_preview(
    db: DbDep,
    skill: Literal["beginner", "intermediate", "advanced"],
    budget: Literal["30m", "1h", "2h", "weekends"],
) -> dict:
    path = await published_path(db)
    if not path:
        raise api_error(404, "No career path is published yet.", "not_found")
    return plan_for(await published_levels(db, path.id), skill, budget) or {}
