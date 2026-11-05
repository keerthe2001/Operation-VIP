import uuid
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request, Response, UploadFile, status

from app.api.deps import CurrentUser, SessionDep, SettingsDep
from app.core.config import Settings
from app.core.rate_limit import rate_limit
from app.resume_pipeline.dispatch import dispatch_processing
from app.schemas.resume import ResumeDetail, ResumeRead, ResumeStatusRead
from app.services.resumes import InvalidUploadError, ResumeService
from app.storage.base import FileStorage

router = APIRouter(prefix="/resumes", tags=["resumes"])


def _storage(request: Request) -> FileStorage:
    storage: FileStorage = request.app.state.storage
    return storage


def _upload_limit(request: Request) -> int:
    settings: Settings = request.app.state.settings
    return settings.rate_limit_upload_per_minute


StorageDep = Annotated[FileStorage, Depends(_storage)]


@router.post(
    "/upload",
    response_model=ResumeRead,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(rate_limit("resumes:upload", _upload_limit))],
)
async def upload_resume(
    request: Request,
    background: BackgroundTasks,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
    file: Annotated[UploadFile, File(description="PDF, DOC, DOCX, PNG or JPG")],
) -> ResumeRead:
    limit = settings.max_upload_mb * 1024 * 1024
    data = await file.read(limit + 1)
    if len(data) > limit:
        error = InvalidUploadError(f"The file is larger than {settings.max_upload_mb} MB.")
        error.code = "FILE_TOO_LARGE"
        raise error
    resume = await ResumeService(session, storage, settings).upload(user.id, file.filename, data)
    await dispatch_processing(request.app, background, resume.id)
    return ResumeRead.model_validate(resume)


@router.get("", response_model=list[ResumeRead])
async def list_resumes(
    user: CurrentUser, session: SessionDep, settings: SettingsDep, storage: StorageDep
) -> list[ResumeRead]:
    resumes = await ResumeService(session, storage, settings).list(user.id)
    return [ResumeRead.model_validate(r) for r in resumes]


@router.get("/{resume_id}", response_model=ResumeDetail)
async def get_resume(
    resume_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> ResumeDetail:
    resume = await ResumeService(session, storage, settings).get(user.id, resume_id)
    return ResumeDetail.model_validate(resume)


@router.get("/{resume_id}/status", response_model=ResumeStatusRead)
async def get_resume_status(
    resume_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> ResumeStatusRead:
    resume = await ResumeService(session, storage, settings).get(user.id, resume_id)
    return ResumeStatusRead.model_validate(resume)


@router.get("/{resume_id}/file", response_class=Response)
async def download_resume(
    resume_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> Response:
    resume, data = await ResumeService(session, storage, settings).read_file(user.id, resume_id)
    return Response(
        content=data,
        media_type=resume.mime_type,
        headers={
            "Content-Disposition": f'inline; filename="{resume.file_name.replace(chr(34), "")}"',
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "private, no-store",
            "Content-Security-Policy": "sandbox",
        },
    )


@router.post(
    "/{resume_id}/process", response_model=ResumeRead, status_code=status.HTTP_202_ACCEPTED
)
async def reprocess_resume(
    resume_id: uuid.UUID,
    request: Request,
    background: BackgroundTasks,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> ResumeRead:
    resume = await ResumeService(session, storage, settings).mark_for_reprocessing(
        user.id, resume_id
    )
    await dispatch_processing(request.app, background, resume.id)
    return ResumeRead.model_validate(resume)


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: uuid.UUID,
    user: CurrentUser,
    session: SessionDep,
    settings: SettingsDep,
    storage: StorageDep,
) -> None:
    await ResumeService(session, storage, settings).delete(user.id, resume_id)
