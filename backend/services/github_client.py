import httpx
from services.auth import get_token


async def github_get(path: str, params: dict | None = None) -> dict | list:
    token = get_token()
    if not token:
        raise RuntimeError("未认证")
    async with httpx.AsyncClient(verify=False) as client:
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
    async with httpx.AsyncClient(verify=False) as client:
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


async def create_pr_review(
    owner: str,
    repo: str,
    pull_number: int,
    commit_id: str,
    body: str,
    comments: list[dict] | None = None,
) -> dict | None:
    """向 GitHub PR 提交评审评论"""
    token = get_token()
    if not token:
        return None  # 未认证时静默跳过

    payload: dict = {
        "commit_id": commit_id,
        "body": body,
        "event": "COMMENT",
    }
    if comments:
        # GitHub API 限制每次最多约 50 条评论
        payload["comments"] = comments[:50]

    try:
        return await github_post(
            f"/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
            payload,
        )
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"GitHub PR Review 提交失败: {e}")
        return None
