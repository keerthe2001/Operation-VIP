"""Queue mode: the API enqueues an arq job and the worker processes it."""

from arq.worker import Worker
from httpx import AsyncClient

from app.workers.resume_worker import WorkerSettings, process_resume, shutdown, startup
from tests.conftest import auth_headers
from tests.fixtures.documents import make_pdf
from tests.fixtures.sample_resumes import ENGINEER


async def test_queue_mode_enqueues_and_worker_processes(client: AsyncClient, app):
    headers = await auth_headers(client)
    app.state.settings.resume_processing_mode = "queue"
    try:
        response = await client.post(
            "/api/v1/resumes/upload",
            headers=headers,
            files={"file": ("cv.pdf", make_pdf(ENGINEER), "application/pdf")},
        )
    finally:
        app.state.settings.resume_processing_mode = "inline"
    resume_id = response.json()["id"]
    status = (await client.get(f"/api/v1/resumes/{resume_id}/status", headers=headers)).json()
    assert status["status"] == "uploaded"  # not processed in the API process

    worker = Worker(
        functions=[process_resume],
        redis_settings=WorkerSettings.redis_settings,
        on_startup=startup,
        on_shutdown=shutdown,
        burst=True,
        poll_delay=0.1,
    )
    try:
        await worker.main()
    finally:
        await worker.close()
    assert worker.jobs_complete == 1

    status = (await client.get(f"/api/v1/resumes/{resume_id}/status", headers=headers)).json()
    assert status["status"] == "ready"
