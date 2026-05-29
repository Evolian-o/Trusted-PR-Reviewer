import os

import httpx

GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
GITHUB_REDIRECT_URI = os.environ.get("GITHUB_REDIRECT_URI", "http://localhost:8000/api/auth/callback")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

_auth_state: dict | None = None


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


def get_user_info() -> dict | None:
    return _auth_state


def clear_auth() -> None:
    global _auth_state
    _auth_state = None


def _set_auth(token: str, user_info: dict) -> None:
    global _auth_state
    _auth_state = {
        "token": token,
        "user_id": user_info["id"],
        "user_login": user_info["login"],
        "avatar_url": user_info.get("avatar_url", ""),
    }


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
