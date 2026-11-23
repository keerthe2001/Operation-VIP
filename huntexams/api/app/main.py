import logging
import mimetypes
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from app import routes_admin, routes_auth, routes_learn, routes_projects
from app.config import Settings, get_settings
from app.content import sync_content
from app.core import Database, RateLimiter

logger = logging.getLogger("huntexams")
MUTATING = {"POST", "PUT", "PATCH", "DELETE"}


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.seed_content_on_startup:
            root = Path(settings.content_dir)
            if root.is_dir():  # noqa: ASYNC240 - one stat call at startup
                async with app.state.db.sessionmaker() as session:
                    logger.info("content: %s", await sync_content(session, root, overwrite=False))
        yield
        await app.state.db.dispose()

    app = FastAPI(
        title="HuntExams API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.app_env != "production" else None,
        openapi_url="/api/openapi.json" if settings.app_env != "production" else None,
    )
    app.state.settings = settings
    app.state.db = Database(settings.database_url)
    app.state.limiter = RateLimiter()

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
            allow_headers=["Content-Type", "X-HX-Client", "X-Timezone"],
        )

    @app.middleware("http")
    async def csrf_and_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        # Cookies are SameSite=Lax; requiring a custom header on writes also blocks
        # cross-site form posts, because browsers can't add it without a CORS preflight.
        if request.method in MUTATING and request.headers.get("x-hx-client") != "web":
            return JSONResponse(
                status_code=403,
                content={"detail": {"code": "csrf", "message": "Missing client header."}},
            )
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        path = request.url.path
        if path.startswith(("/assets/", "/pyodide/")):
            response.headers.setdefault("Cache-Control", "public, max-age=31536000, immutable")
        else:
            response.headers.setdefault("Cache-Control", "no-store")
        return response

    @app.exception_handler(RequestValidationError)
    async def validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        first = exc.errors()[0] if exc.errors() else {"msg": "Invalid request"}
        msg = str(first.get("msg", "Invalid request")).removeprefix("Value error, ")
        field = first.get("loc", [])[-1] if first.get("loc") else None
        return JSONResponse(
            status_code=422, content={"detail": {"code": "invalid", "message": msg, "field": field}}
        )

    @app.get("/api/health")
    async def health() -> dict:
        return {"ok": True}

    for module in (routes_auth, routes_learn, routes_projects):
        app.include_router(module.router, prefix="/api")
    app.include_router(routes_auth.me, prefix="/api")
    app.include_router(routes_admin.router, prefix="/api")
    if settings.web_dist:
        _serve_web(app, Path(settings.web_dist))
    return app


def _serve_web(app: FastAPI, dist: Path) -> None:
    """Serve the built single-page app: real files when they exist, index.html otherwise."""
    mimetypes.add_type("application/wasm", ".wasm")
    mimetypes.add_type("text/javascript", ".mjs")
    root = dist.resolve()
    index = root / "index.html"
    if not index.is_file():
        logger.warning("HX_WEB_DIST=%s has no index.html; website not served", dist)
        return

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path.startswith("api/") or path == "api":
            return JSONResponse(  # type: ignore[return-value]
                status_code=404, content={"detail": {"code": "not_found", "message": "Not found"}}
            )
        candidate = (root / path).resolve()
        # Never serve anything outside the dist folder (no ../ traversal).
        if path and candidate.is_relative_to(root) and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(index)
