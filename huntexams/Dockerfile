# One image with the API and the built website (served by the API from the same origin).
# Build from the repository root:  docker build -f huntexams/Dockerfile -t huntexams .
FROM node:22-slim AS web
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile --filter @huntexams/web... && pnpm --filter @huntexams/web build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 UV_COMPILE_BYTECODE=1 \
    HX_APP_ENV=production HX_WEB_DIST=/app/web
RUN pip install --no-cache-dir uv==0.11.32
WORKDIR /app
COPY huntexams/api/pyproject.toml huntexams/api/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY huntexams/api/ ./
COPY --from=web /repo/apps/huntexams/dist /app/web
RUN useradd --create-home app && chown -R app /app
USER app
EXPOSE 10000
# Migrations first; the curriculum loads on startup only when the database has none.
CMD ["sh", "-c", "uv run --no-dev alembic upgrade head && uv run --no-dev uvicorn app.asgi:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers --forwarded-allow-ips='*'"]
