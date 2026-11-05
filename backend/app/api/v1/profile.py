import uuid

from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep, SettingsDep
from app.api.v1.resumes import StorageDep
from app.schemas.profile import ProfileCompletion, ProfilePatch, ProfileRead, ProfileWrite
from app.services.profile import ProfileService
from app.services.resumes import ResumeService

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=ProfileRead)
async def get_profile(user: CurrentUser, session: SessionDep) -> ProfileRead:
    service = ProfileService(session)
    profile = await service.get_or_create(user.id)
    await session.commit()
    return await service.read(profile)


@router.put("", response_model=ProfileRead)
async def replace_profile(
    payload: ProfileWrite, user: CurrentUser, session: SessionDep
) -> ProfileRead:
    service = ProfileService(session)
    return await service.read(await service.replace(user.id, payload))


@router.patch("", response_model=ProfileRead)
async def patch_profile(
    payload: ProfilePatch, user: CurrentUser, session: SessionDep
) -> ProfileRead:
    service = ProfileService(session)
    return await service.read(await service.patch(user.id, payload))


@router.get("/completion", response_model=ProfileCompletion)
async def get_completion(user: CurrentUser, session: SessionDep) -> ProfileCompletion:
    service = ProfileService(session)
    profile = await service.get_or_create(user.id)
    await session.commit()
    return (await service.read(profile)).completion


@router.post("/import/{resume_id}", response_model=ProfileRead)
async def import_from_resume(
    resume_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> ProfileRead:
    """Replace the profile with the data extracted from one of the user's resumes."""
    resume = await ResumeService(session, storage, settings).get(user.id, resume_id)
    service = ProfileService(session)
    return await service.read(await service.import_resume(user.id, resume))
