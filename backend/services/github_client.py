import httpx
from services.auth import get_token


async def github_get(path: str, params: dict | None = None) -> dict | list:
    token = get_token()
    if not token:
        raise RuntimeError("未认证")
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://api.github.com{path}",
            params=params or {},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()


async def github_post(path: str, data: dict) -> dict:
    token = get_token()
    if not token:
        raise RuntimeError("未认证")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"https://api.github.com{path}",
            json=data,
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        resp.raise_for_status()
        return resp.json()
