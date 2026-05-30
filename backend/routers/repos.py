"""仓库 & 监控 & PR 操作端点"""

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from schemas import MonitorBody, CreatePRBody, MergeBody
from services.auth_middleware import require_auth
from services.auth import AuthInfo
from services.database import (
    list_monitored_repos, add_monitored_repo, remove_monitored_repo,
)
from services.github_client import check_repo_exists, merge_pr

router = APIRouter()


@router.get("/api/repos")
async def repo_list(auth: AuthInfo = Depends(require_auth)):
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            params={"sort": "updated", "per_page": 100, "type": "all"},
            headers={
                "Authorization": f"Bearer {auth.github_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        repos = resp.json()
        if not isinstance(repos, list):
            return JSONResponse(content={"error": "获取仓库失败"}, status_code=400)
        result = [
            {
                "id": r["id"],
                "owner": r["owner"]["login"],
                "repo": r["name"],
                "full_name": r["full_name"],
                "description": r.get("description", ""),
                "private": r["private"],
                "updated_at": r["updated_at"],
            }
            for r in repos
        ]
        return {"repos": result}


@router.get("/api/monitor")
async def monitor_list(auth: AuthInfo = Depends(require_auth)):
    repos = await list_monitored_repos(auth.user_id)
    return {"repos": repos}


@router.post("/api/monitor")
async def monitor_add(body: MonitorBody, auth: AuthInfo = Depends(require_auth)):
    owner, repo = body.owner, body.repo
    if not owner or not repo:
        return JSONResponse(content={"error": "缺少 owner 或 repo"}, status_code=400)
    if not await check_repo_exists(owner, repo, token=auth.github_token):
        return JSONResponse(content={"error": f"仓库 {owner}/{repo} 不存在或无权访问"}, status_code=404)
    await add_monitored_repo(auth.user_id, owner, repo)
    return {"status": "ok"}


@router.delete("/api/monitor/{repo_id}")
async def monitor_delete(repo_id: int, auth: AuthInfo = Depends(require_auth)):
    deleted = await remove_monitored_repo(repo_id)
    if not deleted:
        return JSONResponse(content={"error": "记录不存在"}, status_code=404)
    return {"status": "ok"}


@router.get("/api/repos/{owner}/{repo}/pulls")
async def repo_pulls(owner: str, repo: str, state: str = "open", auth: AuthInfo = Depends(require_auth)):
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            params={"state": state, "per_page": 30},
            headers={
                "Authorization": f"Bearer {auth.github_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        data = resp.json()
        if not isinstance(data, list):
            return JSONResponse(content={"error": data.get("message", "获取 PR 失败")}, status_code=resp.status_code)
        return {
            "pulls": [
                {
                    "number": p["number"],
                    "title": p["title"],
                    "state": p["state"],
                    "html_url": p["html_url"],
                    "user": p["user"]["login"],
                    "created_at": p["created_at"],
                    "updated_at": p["updated_at"],
                    "head_sha": p["head"]["sha"],
                }
                for p in data
            ]
        }


@router.post("/api/repos/{owner}/{repo}/pulls")
async def repo_create_pr(owner: str, repo: str, body: CreatePRBody, auth: AuthInfo = Depends(require_auth)):
    if not body.title or not body.head:
        return JSONResponse(content={"error": "缺少 title 或 head"}, status_code=400)
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            json={"title": body.title, "head": body.head, "base": body.base},
            headers={
                "Authorization": f"Bearer {auth.github_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        pr = resp.json()
        if resp.status_code >= 400:
            return JSONResponse(content={"error": pr.get("message", "创建 PR 失败")}, status_code=resp.status_code)
        return {"number": pr["number"], "html_url": pr["html_url"], "title": pr["title"]}


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/merge")
async def repo_merge_pr(owner: str, repo: str, pull_number: int, body: MergeBody, auth: AuthInfo = Depends(require_auth)):
    merge_method = body.merge_method
    if merge_method not in ("merge", "squash", "rebase"):
        return JSONResponse(content={"error": "merge_method 必须是 merge / squash / rebase"}, status_code=400)
    result = await merge_pr(owner, repo, pull_number, token=auth.github_token, merge_method=merge_method)
    if result["merged"]:
        return {"status": "ok", "message": result.get("message", "合并成功")}
    reason = result.get("reason", "未知错误")
    if "not found" in reason.lower():
        return JSONResponse(content={"error": reason}, status_code=404)
    if "permission" in reason.lower() or "forbidden" in reason.lower():
        return JSONResponse(content={"error": reason}, status_code=403)
    if "conflict" in reason.lower() or "not mergeable" in reason.lower():
        return JSONResponse(content={"error": reason}, status_code=409)
    return JSONResponse(content={"error": reason}, status_code=422)
