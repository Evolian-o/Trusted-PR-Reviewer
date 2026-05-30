"""设置端点 — 获取/更新/邮件测试"""

import logging
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from schemas import SettingsBody, EmailTestBody
from services.auth_middleware import require_auth
from services.auth import AuthInfo
from services.database import (
    get_all_settings, get_email_config, save_email_config,
    get_setting, set_setting,
)
from services.scheduler import start_scheduler

router = APIRouter()


@router.get("/api/settings")
async def settings_get(auth: AuthInfo = Depends(require_auth)):
    kv = await get_all_settings(auth.user_id)
    email = await get_email_config(auth.user_id)
    return {
        "poll_interval_seconds": kv.get("poll_interval_seconds", "300"),
        "default_provider": kv.get("default_provider", "deepseek"),
        "default_model": kv.get("default_model", ""),
        "chunk_max_chars": kv.get("chunk_max_chars", "8000"),
        "chunk_merge_max_chars": kv.get("chunk_merge_max_chars", "6000"),
        "chunk_max_lines": kv.get("chunk_max_lines", "2000"),
        "chunk_strategy": kv.get("chunk_strategy", "auto"),
        "email": {
            "to_email": email.get("to_email", "") if email else "",
            "password": email.get("password", "") if email else "",
            "enabled": bool(email.get("enabled")) if email else False,
        },
    }


@router.put("/api/settings")
async def settings_update(body: SettingsBody, auth: AuthInfo = Depends(require_auth)):
    data = body.model_dump(exclude_none=True)
    for key in (
        "poll_interval_seconds", "default_provider", "default_model",
        "chunk_max_chars", "chunk_merge_max_chars", "chunk_max_lines", "chunk_strategy",
    ):
        if key in data:
            await set_setting(auth.user_id, key, str(data[key]))

    if data.get("email"):
        await save_email_config(auth.user_id, data["email"])

    try:
        interval = int(data.get("poll_interval_seconds", 300))
        await start_scheduler(auth.user_id, interval)
    except Exception as e:
        logging.getLogger("main").warning(f"调度器操作失败: {e}")

    return {"status": "ok"}


@router.post("/api/settings/email/test")
async def email_test(body: EmailTestBody, auth: AuthInfo = Depends(require_auth)):
    from services.email_notifier import send_test_email
    try:
        await send_test_email(body.model_dump())
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
