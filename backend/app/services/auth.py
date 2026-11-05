import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import ConflictError, InvalidCredentialsError, InvalidTokenError
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    password_needs_rehash,
    verify_password,
)
from app.db.models import RefreshToken, TokenClient, User
from app.repositories.refresh_tokens import RefreshTokenRepository
from app.repositories.users import UserRepository

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class IssuedTokens:
    user: User
    access_token: str
    access_expires_at: datetime
    refresh_token: str
    refresh_expires_at: datetime
    refresh_token_id: uuid.UUID
    client: TokenClient


class AuthService:
    def __init__(self, session: AsyncSession, settings: Settings) -> None:
        self.session = session
        self.settings = settings
        self.users = UserRepository(session)
        self.tokens = RefreshTokenRepository(session)

    async def register(
        self, *, email: str, password: str, full_name: str | None, client: TokenClient
    ) -> IssuedTokens:
        if await self.users.get_by_email(email):
            raise ConflictError("An account with this email already exists.")
        user = User(email=email.lower(), password_hash=hash_password(password), full_name=full_name)
        try:
            await self.users.add(user)
        except IntegrityError as exc:  # concurrent registration with the same email
            await self.session.rollback()
            raise ConflictError("An account with this email already exists.") from exc
        issued = await self._issue(user, client=client, family_id=uuid.uuid4())
        await self.session.commit()
        logger.info("User registered id=%s", user.id)
        return issued

    async def login(self, *, email: str, password: str, client: TokenClient) -> IssuedTokens:
        user = await self.users.get_by_email(email)
        if not verify_password(password, user.password_hash if user else None) or user is None:
            raise InvalidCredentialsError()
        if not user.is_active:
            raise InvalidCredentialsError("This account is disabled.")
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)
        issued = await self._issue(user, client=client, family_id=uuid.uuid4())
        await self.session.commit()
        return issued

    async def refresh(self, raw_token: str) -> IssuedTokens:
        now = datetime.now(UTC)
        token = await self.tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if token is None:
            raise InvalidTokenError()

        if token.revoked_at is not None:
            if token.replaced_by_id is not None:
                # A rotated token was presented again: assume it was stolen.
                logger.warning("Refresh token reuse detected family=%s", token.family_id)
                await self.tokens.revoke_family(token.family_id, now)
                await self.session.commit()
            raise InvalidTokenError()

        if token.expires_at <= now:
            raise InvalidTokenError()

        user = await self.users.get(token.user_id)
        if user is None or not user.is_active:
            raise InvalidTokenError()

        issued = await self._issue(user, client=token.client, family_id=token.family_id)
        token.revoked_at = now
        token.replaced_by_id = issued.refresh_token_id
        await self.session.commit()
        return issued

    async def logout(self, raw_token: str) -> None:
        token = await self.tokens.get_by_hash_for_update(hash_refresh_token(raw_token))
        if token is not None:
            await self.tokens.revoke_family(token.family_id, datetime.now(UTC))
            await self.session.commit()

    async def _issue(
        self, user: User, *, client: TokenClient, family_id: uuid.UUID
    ) -> IssuedTokens:
        access_token, access_expires_at = create_access_token(
            user.id,
            secret=self.settings.jwt_secret,
            algorithm=self.settings.jwt_algorithm,
            ttl=timedelta(minutes=self.settings.access_token_ttl_minutes),
        )
        raw_refresh = generate_refresh_token()
        refresh_expires_at = datetime.now(UTC) + timedelta(
            days=self.settings.refresh_token_ttl_days
        )
        stored = await self.tokens.add(
            RefreshToken(
                user_id=user.id,
                family_id=family_id,
                token_hash=hash_refresh_token(raw_refresh),
                client=client,
                expires_at=refresh_expires_at,
            )
        )
        return IssuedTokens(
            user=user,
            access_token=access_token,
            access_expires_at=access_expires_at,
            refresh_token=raw_refresh,
            refresh_expires_at=refresh_expires_at,
            refresh_token_id=stored.id,
            client=client,
        )
