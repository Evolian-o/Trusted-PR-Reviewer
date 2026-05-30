"""调度器端点 — 状态/启动/停止"""

from fastapi import APIRouter, Depends

from services.auth_middleware import require_auth
from services.auth import AuthInfo
from services.scheduler import start_scheduler, stop_scheduler, get_scheduler_status
from services.database import get_setting, list_monitored_repos

router = APIRouter()


@router.get("/api/scheduler/status")
async def scheduler_status(auth: AuthInfo = Depends(require_auth)):
    status = get_scheduler_status(auth.user_id)
    repos = await list_monitored_repos(auth.user_id)
    status["monitored_repos"] = len([r for r in repos if r.get("active")])
    return status


@router.post("/api/scheduler/start")
async def scheduler_start(auth: AuthInfo = Depends(require_auth)):
    interval = int(await get_setting(auth.user_id, "poll_interval_seconds", "300"))
    await start_scheduler(auth.user_id, interval)
    return {"status": "ok", "message": f"调度器已启动，间隔 {interval}s"}


@router.post("/api/scheduler/stop")
async def scheduler_stop(auth: AuthInfo = Depends(require_auth)):
    await stop_scheduler(auth.user_id)
    return {"status": "ok", "message": "调度器已停止"}
