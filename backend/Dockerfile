# syntax=docker/dockerfile:1
# Two targets share one dependency layer:
#   api    - slim image serving HTTP
#   worker - adds Tesseract (OCR) and LibreOffice (.doc conversion) for resume processing
FROM python:3.13-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

RUN pip install --no-cache-dir "uv==0.11.*"

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY . .

RUN useradd --create-home --uid 10001 app && mkdir -p /data/storage && chown -R app /app /data/storage
ENV PATH="/app/.venv/bin:$PATH"

FROM base AS worker
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr tesseract-ocr-eng libreoffice-writer-nogui fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*
USER app
ENV HOME=/home/app
CMD ["arq", "app.workers.resume_worker.WorkerSettings"]

FROM base AS api
USER app
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.asgi:app --host 0.0.0.0 --port 8000 --proxy-headers"]
