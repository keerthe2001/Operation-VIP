import logging

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.api.deps import RedisDep, SessionDep

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str


@router.get("/health", response_model=HealthResponse)
async def health(session: SessionDep, redis: RedisDep, response: Response) -> HealthResponse:
    database = redis_state = "ok"
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        logger.exception("Database health check failed")
        database = "unavailable"
    try:
        await redis.ping()
    except Exception:
        logger.exception("Redis health check failed")
        redis_state = "unavailable"
    healthy = database == "ok" and redis_state == "ok"
    if not healthy:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return HealthResponse(
        status="ok" if healthy else "degraded", database=database, redis=redis_state
    )
