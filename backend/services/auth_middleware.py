"""FastAPI 认证依赖注入"""
from fastapi import HTTPException, Request

from services.auth import AuthInfo, get_auth_from_request, verify_token


async def require_auth(request: Request) -> AuthInfo:
    """强制认证 — 未登录返回 401"""
    auth = await get_auth_from_request(request)
    if auth is None:
        raise HTTPException(status_code=401, detail="请先登录 GitHub")
    return auth


async def optional_auth(request: Request) -> AuthInfo | None:
    """可选认证 — 未登录返回 None"""
    return await get_auth_from_request(request)
