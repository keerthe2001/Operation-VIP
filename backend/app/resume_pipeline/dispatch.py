"""Hands resume processing to the right executor (in-process or arq worker)."""

import uuid

from arq.connections import ArqRedis, RedisSettings, create_pool
from fastapi import BackgroundTasks, FastAPI

from app.core.config import Settings
from app.resume_pipeline.pipeline import ResumeProcessor

JOB_NAME = "process_resume"


async def _arq_pool(app: FastAPI, settings: Settings) -> ArqRedis:
    pool: ArqRedis | None = getattr(app.state, "arq_pool", None)
    if pool is None:
        pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
        app.state.arq_pool = pool
    return pool


async def dispatch_processing(
    app: FastAPI, background: BackgroundTasks, resume_id: uuid.UUID
) -> None:
    settings: Settings = app.state.settings
    if settings.resume_processing_mode == "queue":
        pool = await _arq_pool(app, settings)
        await pool.enqueue_job(
            JOB_NAME, str(resume_id), _job_id=f"resume:{resume_id}:{uuid.uuid4().hex}"
        )
        return
    processor: ResumeProcessor = app.state.resume_processor
    background.add_task(processor.process, resume_id)
