import httpx


async def github_get(path: str, params: dict | None = None, token: str | None = None) -> dict | list:
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


async def github_post(path: str, data: dict, token: str | None = None) -> dict:
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


async def check_repo_exists(owner: str, repo: str, token: str | None = None) -> bool:
    """验证仓库是否存在（公开仓库或用户有权限的私有仓库）"""
    if not token:
        return False
    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            return resp.status_code == 200
    except Exception:
        return False


async def merge_pr(
    owner: str,
    repo: str,
    pull_number: int,
    token: str | None = None,
    merge_method: str = "merge",
) -> dict:
    """合并 PR，返回 {"merged": true, "message": "..."} 或 {"merged": false, "reason": "..."}"""
    if not token:
        return {"merged": False, "reason": "未认证"}

    try:
        async with httpx.AsyncClient(verify=False) as client:
            resp = await client.put(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}/merge",
                json={"merge_method": merge_method},
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            if resp.status_code == 200:
                result = resp.json()
                return {"merged": result.get("merged", True), "message": result.get("message", "合并成功")}
            err = resp.json()
            return {"merged": False, "reason": err.get("message", f"合并失败 (HTTP {resp.status_code})")}
    except Exception as e:
        return {"merged": False, "reason": str(e)}


async def create_pr_review(
    owner: str,
    repo: str,
    pull_number: int,
    commit_id: str,
    body: str,
    comments: list[dict] | None = None,
    token: str | None = None,
) -> dict | None:
    """向 GitHub PR 提交评审评论，返回 result dict 或包含 error 字段的 dict"""
    if not token:
        return {"error": "未认证，请先登录 GitHub"}

    payload: dict = {
        "commit_id": commit_id,
        "body": body,
        "event": "COMMENT",
    }
    if comments:
        payload["comments"] = comments[:50]

    try:
        return await github_post(
            f"/repos/{owner}/{repo}/pulls/{pull_number}/reviews",
            payload,
            token=token,
        )
    except Exception as e:
        msg = str(e).strip() or f"{type(e).__name__}"
        # 提取 httpx HTTPStatusError 中的响应体
        try:
            if hasattr(e, 'response') and e.response is not None:
                body_text = e.response.text[:500] if hasattr(e.response, 'text') else ''
                if body_text:
                    import json as _json
                    try:
                        err_data = _json.loads(body_text)
                        msg = err_data.get("message", msg)
                    except Exception:
                        msg = body_text[:200] or msg
        except Exception:
            pass
        import logging
        logging.getLogger(__name__).warning(f"GitHub PR Review 提交失败: {msg}")
        return {"error": msg}
