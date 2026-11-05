"""arq worker: `arq app.workers.resume_worker.WorkerSettings`."""

import uuid
from typing import Any, ClassVar

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.logging import configure_logging
from app.db.session import Database
from app.resume_pipeline.pipeline import ResumeProcessor
from app.storage.factory import create_storage


async def startup(ctx: dict[str, Any]) -> None:
    settings = get_settings()
    configure_logging(settings.log_level)
    database = Database(settings.database_url)
    ctx["db"] = database
    ctx["processor"] = ResumeProcessor(database.sessionmaker, create_storage(settings), settings)


async def shutdown(ctx: dict[str, Any]) -> None:
    await ctx["db"].dispose()


async def process_resume(ctx: dict[str, Any], resume_id: str) -> None:
    processor: ResumeProcessor = ctx["processor"]
    await processor.process(uuid.UUID(resume_id))


class WorkerSettings:
    functions: ClassVar[list[Any]] = [process_resume]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    max_jobs = 4
    job_timeout = 300
