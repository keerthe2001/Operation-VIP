from fastapi import APIRouter

from app.api.v1 import answers, auth, extension, health, profile, resumes

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(resumes.router)
api_router.include_router(profile.router)
api_router.include_router(extension.router)
api_router.include_router(answers.router)
