import asyncio
import os
import time
import uuid
from dataclasses import dataclass

import httpx
from fastapi import Request

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.environ.get("GITHUB_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:8000")

TOKEN_MAX_AGE_SECONDS = 8 * 3600  # 8 小时后校验一次
SESSION_MAX_AGE_SECONDS = 7 * 24 * 3600  # 7 天过期


@dataclass
class AuthInfo:
    session_id: str
    user_id: int
    github_token: str
    user_login: str
    avatar_url: str = ""
    issued_at: float = 0.0

    def is_token_expired(self) -> bool:
        return (time.time() - self.issued_at) > TOKEN_MAX_AGE_SECONDS


# ── 内存缓存（避免每次请求都查 DB）──

_cache: dict[str, AuthInfo] = {}
_cache_ts: dict[str, float] = {}
CACHE_TTL = 60  # 秒


def _cache_get(session_id: str) -> AuthInfo | None:
    entry = _cache.get(session_id)
    if entry is not None and (time.time() - _cache_ts.get(session_id, 0)) < CACHE_TTL:
        return entry
    return None


def _cache_set(session_id: str, auth: AuthInfo) -> None:
    _cache[session_id] = auth
    _cache_ts[session_id] = time.time()


def _cache_remove(session_id: str) -> None:
    _cache.pop(session_id, None)
    _cache_ts.pop(session_id, None)


# ── Session 管理 ──

async def create_session(github_token: str, user_info: dict) -> tuple[str, AuthInfo]:
    """创建新 session，写入 sessions 表，返回 (session_id, AuthInfo)"""
    from services.database import create_session as db_create_session

    session_id = uuid.uuid4().hex[:32]
    auth = AuthInfo(
        session_id=session_id,
        user_id=user_info["id"],
        github_token=github_token,
        user_login=user_info["login"],
        avatar_url=user_info.get("avatar_url", ""),
        issued_at=time.time(),
    )
    # 计算过期时间（7 天后）
    expires_at = time.strftime(
        "%Y-%m-%d %H:%M:%S",
        time.localtime(time.time() + SESSION_MAX_AGE_SECONDS),
    )
    await db_create_session(
        session_id=session_id,
        user_id=auth.user_id,
        github_token=auth.github_token,
        user_login=auth.user_login,
        avatar_url=auth.avatar_url,
        expires_at=expires_at,
    )
    _cache_set(session_id, auth)
    return session_id, auth


async def get_session(session_id: str) -> AuthInfo | None:
    """从 sessions 表读取 session，优先使用内存缓存"""
    cached = _cache_get(session_id)
    if cached is not None:
        return cached

    from services.database import get_session as db_get_session
    row = await db_get_session(session_id)
    if not row:
        return None

    # 检查是否过期
    from datetime import datetime
    expires_str = row.get("expires_at", "")
    if expires_str:
        try:
            expires = datetime.strptime(expires_str, "%Y-%m-%d %H:%M:%S")
            if expires < datetime.now():
                await destroy_session(session_id)
                return None
        except ValueError:
            pass

    auth = AuthInfo(
        session_id=session_id,
        user_id=row["user_id"],
        github_token=row["github_token"],
        user_login=row["user_login"],
        avatar_url=row.get("avatar_url", ""),
        issued_at=time.time(),
    )
    _cache_set(session_id, auth)
    return auth


async def destroy_session(session_id: str) -> None:
    """删除单个 session"""
    from services.database import delete_session as db_delete_session
    await db_delete_session(session_id)
    _cache_remove(session_id)


async def destroy_all_user_sessions(user_id: int) -> None:
    """删除某用户的所有 session"""
    from services.database import delete_all_user_sessions as db_delete_all
    await db_delete_all(user_id)
    # 清理缓存中该用户的 session
    to_remove = [sid for sid, a in _cache.items() if a.user_id == user_id]
    for sid in to_remove:
        _cache_remove(sid)


def extract_session_id(request: Request) -> str | None:
    """从请求 cookie 中提取 pr_session"""
    return request.cookies.get("pr_session")


async def get_auth_from_request(request: Request) -> AuthInfo | None:
    """从请求中提取 session 并返回 AuthInfo"""
    sid = extract_session_id(request)
    if not sid:
        return None
    return await get_session(sid)


# ── GitHub OAuth 流程 ──

def get_login_url() -> str:
    return (
        "https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&redirect_uri={GITHUB_REDIRECT_URI}"
        "&scope=repo,user"
    )


async def exchange_code(code: str) -> str:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": GITHUB_CLIENT_ID,
                "client_secret": GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )
        data = resp.json()
        if "error" in data:
            raise RuntimeError(data.get("error_description", data["error"]))
        return data["access_token"]


async def fetch_github_user(token: str) -> dict:
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def complete_auth(code: str) -> tuple[str, AuthInfo]:
    """完成 OAuth 交换，创建 session，返回 (session_id, AuthInfo)"""
    token = await exchange_code(code)
    user_info = await fetch_github_user(token)
    return await create_session(token, user_info)


async def verify_token(token: str) -> bool:
    """验证 GitHub token 是否有效"""
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {token}"},
            )
            return resp.status_code == 200
    except Exception:
        return False


def get_token() -> str | None:
    """兼容旧代码 — 返回 None，新代码应使用 AuthInfo"""
    return None


def get_user_id() -> int | None:
    """兼容旧代码 — 返回 None，新代码应使用 AuthInfo"""
    return None
