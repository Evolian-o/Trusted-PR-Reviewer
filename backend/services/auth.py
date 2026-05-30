import asyncio
import json
import os
import time

import httpx

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.environ.get("GITHUB_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

_auth_state: dict | None = None
TOKEN_MAX_AGE_SECONDS = 8 * 3600  # 8 小时后校验一次


def get_token() -> str | None:
    if _auth_state is None:
        return None
    return _auth_state.get("token")


def get_user_id() -> int | None:
    if _auth_state is None:
        return None
    return _auth_state.get("user_id")


def is_authenticated() -> bool:
    return _auth_state is not None and "token" in _auth_state


def is_token_expired() -> bool:
    """Returns True if the token is old enough to warrant re-verification"""
    if _auth_state is None:
        return True
    issued = _auth_state.get("issued_at", 0)
    return (time.time() - issued) > TOKEN_MAX_AGE_SECONDS


async def verify_token() -> bool:
    """Quick token validity check against GitHub API"""
    token = get_token()
    if not token:
        return False
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                "https://api.github.com/user",
                headers={"Authorization": f"Bearer {token}"},
            )
            return resp.status_code == 200
    except Exception:
        return False


def get_user_info() -> dict | None:
    if _auth_state is None:
        return None
    # 去除内部字段后返回
    return {
        "user_id": _auth_state.get("user_id"),
        "user_login": _auth_state.get("user_login"),
        "avatar_url": _auth_state.get("avatar_url", ""),
        "token_age_seconds": int(time.time() - _auth_state.get("issued_at", 0)),
    }


def clear_auth() -> None:
    global _auth_state
    uid = _auth_state.get("user_id", 0) if _auth_state else 0
    _auth_state = None

    async def _clear():
        from services.database import set_setting
        if uid:
            await set_setting(uid, "_auth_state_enc", "")
            await set_setting(uid, "_auth_user_id", "")

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_clear())
    except RuntimeError:
        pass


async def _persist_auth() -> None:
    """加密 auth state 写入 settings 表"""
    from services.database import set_setting
    from services.llm_providers.crypto import encrypt
    if _auth_state is None:
        return
    payload = json.dumps(_auth_state, ensure_ascii=False)
    encrypted = encrypt(payload)
    uid = _auth_state.get("user_id", 0)
    await set_setting(uid, "_auth_state_enc", encrypted)
    await set_setting(uid, "_auth_user_id", str(uid))


async def restore_auth() -> bool:
    """启动时从 DB 恢复认证态，验证 token 有效性"""
    global _auth_state
    from services.database import get_setting, get_db
    from services.llm_providers.crypto import decrypt

    try:
        db = await get_db()
        cursor = await db.execute(
            "SELECT user_id FROM settings WHERE key='_auth_user_id' LIMIT 1"
        )
        row = await cursor.fetchone()
        if not row:
            return False

        uid = int(row[0])
        encrypted = await get_setting(uid, "_auth_state_enc", "")
        if not encrypted:
            return False

        payload = decrypt(encrypted)
        if not payload:
            return False

        _auth_state = json.loads(payload)
        if await verify_token():
            return True
        _auth_state = None
        return False
    except Exception:
        return False


def _set_auth(token: str, user_info: dict) -> None:
    global _auth_state
    _auth_state = {
        "token": token,
        "user_id": user_info["id"],
        "user_login": user_info["login"],
        "avatar_url": user_info.get("avatar_url", ""),
        "issued_at": time.time(),
    }
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            loop.create_task(_persist_auth())
    except RuntimeError:
        pass


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


async def complete_auth(code: str) -> None:
    token = await exchange_code(code)
    user_info = await fetch_github_user(token)
    _set_auth(token, user_info)
