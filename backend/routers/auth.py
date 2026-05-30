"""认证端点 — GitHub OAuth 登录/回调/状态/登出"""

from fastapi import APIRouter, Query, Depends, Request
from fastapi.responses import RedirectResponse, JSONResponse

from services.auth import (
    get_login_url, complete_auth,
    AuthInfo, destroy_session,
    SESSION_MAX_AGE_SECONDS,
)
from services.auth_middleware import require_auth, optional_auth
from services.database import get_setting
from services.scheduler import start_scheduler

router = APIRouter()


@router.get("/api/auth/login")
async def auth_login():
    return {"url": get_login_url()}


@router.get("/api/auth/callback")
async def auth_callback(code: str = Query(...)):
    try:
        session_id, auth = await complete_auth(code)
        try:
            interval = int(await get_setting(auth.user_id, "poll_interval_seconds", "300"))
            await start_scheduler(auth.user_id, interval)
        except Exception:
            pass
        response = RedirectResponse(url="http://localhost:5173/dashboard")
        response.set_cookie(
            key="pr_session",
            value=session_id,
            httponly=True,
            samesite="lax",
            max_age=SESSION_MAX_AGE_SECONDS,
            secure=False,
        )
        return response
    except RuntimeError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)


@router.get("/api/auth/status")
async def auth_status(auth: AuthInfo | None = Depends(optional_auth)):
    if auth is not None:
        expired = auth.is_token_expired()
        return {
            "authenticated": True,
            "login": auth.user_login,
            "avatar_url": auth.avatar_url,
            "user_id": auth.user_id,
            "token_expired": expired,
        }
    return {"authenticated": False}


@router.post("/api/auth/logout")
async def auth_logout(auth: AuthInfo | None = Depends(optional_auth)):
    if auth is not None:
        await destroy_session(auth.session_id)  # type: ignore
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie("pr_session")
    return response
