import logging
import os
from pathlib import Path
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(Path(__file__).parent / "backend.log", encoding="utf-8"),
    ],
)

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from routers import health, auth, repos, providers, scheduler, review, history, settings
from services.scheduler import restore_all_schedulers


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger("main")
    try:
        await restore_all_schedulers()
    except Exception as e:
        logger.warning(f"恢复调度器失败: {e}")
    yield
    try:
        from services.scheduler import stop_all_schedulers
        await stop_all_schedulers()
    except Exception as e:
        logger.warning(f"调度器操作失败: {e}")


app = FastAPI(title="Trusted PR Reviewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    logger = logging.getLogger("main")
    logger.exception(f"未处理异常: {request.method} {request.url.path} — {exc}")
    from fastapi.responses import JSONResponse
    status = 500
    if isinstance(exc, ValueError):
        status = 400
    elif isinstance(exc, RuntimeError):
        status = 500
    return JSONResponse(
        status_code=status,
        content={"error": str(exc) or type(exc).__name__},
    )


app.include_router(health.router)
app.include_router(auth.router)
app.include_router(repos.router)
app.include_router(providers.router)
app.include_router(scheduler.router)
app.include_router(review.router)
app.include_router(history.router)
app.include_router(settings.router)

FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
FRONTEND_DIST = os.path.abspath(FRONTEND_DIST)

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        from fastapi.responses import FileResponse
        index_path = os.path.join(FRONTEND_DIST, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
        return {"error": "前端构建产物不存在，请先构建前端: cd frontend && npm run build"}
