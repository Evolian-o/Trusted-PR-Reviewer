"""仓库 & 监控 & PR 操作端点"""

import httpx
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from schemas import MonitorBody, CreatePRBody, MergeBody, FixPRBody, SuggestFixBody, OptimizeCodeBody, PolishReviewBody, SubmitReviewBody
from services.auth_middleware import require_auth
from services.auth import AuthInfo
from services.database import (
    list_monitored_repos, add_monitored_repo, remove_monitored_repo,
)
from services.github_client import check_repo_exists, merge_pr, create_pr_review

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


@router.get("/api/repos/{owner}/{repo}/pulls/{pull_number}")
async def repo_get_pr(owner: str, repo: str, pull_number: int, auth: AuthInfo = Depends(require_auth)):
    """获取单个 PR 信息（用于检查合并状态等）"""
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}",
            headers={
                "Authorization": f"Bearer {auth.github_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        data = resp.json()
        if resp.status_code >= 400:
            return JSONResponse(content={"error": data.get("message", "获取 PR 失败")}, status_code=resp.status_code)
        return {
            "number": data["number"],
            "title": data["title"],
            "state": data["state"],
            "merged": data.get("merged", False),
            "merged_at": data.get("merged_at"),
            "html_url": data["html_url"],
        }


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


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/fix")
async def repo_fix_pr(owner: str, repo: str, pull_number: int, body: FixPRBody, auth: AuthInfo = Depends(require_auth)):
    from services.pr_fixer import apply_fixes_to_pr
    result = await apply_fixes_to_pr(owner, repo, pull_number, body.rewritten_files, token=auth.github_token)
    if result.get("ok"):
        return result
    return JSONResponse(content=result, status_code=400)


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/suggest-fix")
async def repo_suggest_fix(owner: str, repo: str, pull_number: int, body: SuggestFixBody, auth: AuthInfo = Depends(require_auth)):
    """AI 根据用户需求修改代码并返回建议"""
    from services.llm_providers.factory import get_provider, load_custom_providers
    from services.llm_providers.base import ReviewPrompt

    await load_custom_providers(auth.user_id)

    try:
        provider = get_provider(body.provider, user_id=auth.user_id)
    except ValueError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)

    actual_model = body.model or provider.default_model

    prompt = ReviewPrompt(
        system=(
            "你是代码修改专家。用户会给你一段代码和修改需求，请按要求修改代码。\n\n"
            "请按以下格式回复：\n"
            "1. 先用1-3句简短中文说明你做了哪些修改、为什么这样改\n"
            "2. 然后一行单独的分隔符：---CODE---\n"
            "3. 最后输出完整的修改后代码\n\n"
            "规则：\n"
            "- 说明部分不要包含代码块，只需要简洁的文字解释\n"
            "- 代码部分不要包含任何解释或markdown标记\n"
            "- 确保修改后的代码是可运行的\n"
            "- 保持原有的代码风格和缩进\n"
            "- 如果用户的请求不明确，按最合理的理解修改"
        ),
        user=(
            f"文件: {body.filename}\n"
            f"语言: {body.language}\n"
            f"修改需求: {body.user_request}\n\n"
            f"当前代码:\n```\n{body.current_code[:8000]}\n```"
        ),
    )

    try:
        full_text = ""
        async for token_text in provider.review(prompt, model=actual_model):
            full_text += token_text

        # 解析 AI 输出：说明 + 分隔符 + 代码
        full_text = full_text.strip()
        suggestion = ""
        suggested_code = full_text

        separator = "---CODE---"
        if separator in full_text:
            parts = full_text.split(separator, 1)
            suggestion = parts[0].strip()
            suggested_code = parts[1].strip() if len(parts) > 1 else ""

        # 去掉可能的 markdown 代码块标记
        if suggested_code.startswith("```"):
            lines = suggested_code.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            suggested_code = "\n".join(lines)

        return {"suggestion": suggestion, "suggested_code": suggested_code}
    except Exception as e:
        return JSONResponse(content={"error": f"AI 建议生成失败: {e}"}, status_code=500)


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/optimize-code")
async def repo_optimize_code(owner: str, repo: str, pull_number: int, body: OptimizeCodeBody, auth: AuthInfo = Depends(require_auth)):
    """AI 主动优化代码（无需用户指令），返回优化后代码 + 说明"""
    from services.llm_providers.factory import get_provider, load_custom_providers
    from services.llm_providers.base import ReviewPrompt

    await load_custom_providers(auth.user_id)

    try:
        provider = get_provider(body.provider, user_id=auth.user_id)
    except ValueError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)

    actual_model = body.model or provider.default_model

    prompt = ReviewPrompt(
        system=(
            "你是代码优化专家。请优化以下代码，改进其可读性、性能和安全性。\n\n"
            "请按以下格式回复：\n"
            "1. 先用1-3句简短中文说明你做了哪些优化、为什么这样改\n"
            "2. 然后一行单独的分隔符：---CODE---\n"
            "3. 最后输出完整的优化后代码\n\n"
            "规则：\n"
            "- 说明部分不要包含代码块，只需要简洁的文字解释\n"
            "- 代码部分不要包含任何解释或markdown标记\n"
            "- 确保优化后的代码是可运行的\n"
            "- 保持原有的代码风格和缩进\n"
            "- 只做有意义的改进，不要为了改动而改动"
        ),
        user=(
            f"文件: {body.filename}\n"
            f"语言: {body.language}\n\n"
            f"当前代码:\n```\n{body.current_code[:8000]}\n```"
        ),
    )

    try:
        full_text = ""
        async for token_text in provider.review(prompt, model=actual_model):
            full_text += token_text

        full_text = full_text.strip()
        suggestion = ""
        optimized_code = full_text

        separator = "---CODE---"
        if separator in full_text:
            parts = full_text.split(separator, 1)
            suggestion = parts[0].strip()
            optimized_code = parts[1].strip() if len(parts) > 1 else ""

        # 去掉可能的 markdown 代码块标记
        if optimized_code.startswith("```"):
            lines = optimized_code.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            optimized_code = "\n".join(lines)

        return {"suggestion": suggestion, "optimized_code": optimized_code}
    except Exception as e:
        return JSONResponse(content={"error": f"AI 代码优化失败: {e}"}, status_code=500)


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/polish-review")
async def repo_polish_review(owner: str, repo: str, pull_number: int, body: PolishReviewBody, auth: AuthInfo = Depends(require_auth)):
    """AI 润色评审意见，使其更专业清晰"""
    from services.llm_providers.factory import get_provider, load_custom_providers
    from services.llm_providers.base import ReviewPrompt

    await load_custom_providers(auth.user_id)

    try:
        provider = get_provider(body.provider, user_id=auth.user_id)
    except ValueError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)

    actual_model = body.model or provider.default_model

    prompt = ReviewPrompt(
        system=(
            "你是技术评审专家。用户会给你一段给 PR 作者的评审意见草稿，"
            "请在不改变原意的前提下优化表达，使其更专业、清晰、具有建设性。\n\n"
            "规则：\n"
            "- 保持中文输出\n"
            "- 只输出优化后的文本，不要添加任何解释或前缀\n"
            "- 保持原有的结构（如项目符号、编号等）\n"
            "- 如果原文已经很清晰，可以做最小改动"
        ),
        user=f"评审意见草稿:\n{body.draft_text[:6000]}",
    )

    try:
        full_text = ""
        async for token_text in provider.review(prompt, model=actual_model):
            full_text += token_text

        polished = full_text.strip()

        # 清理常见的前缀
        for prefix in ["优化后：", "优化后:", "润色后：", "润色后:", "以下是优化后的评审意见："]:
            if polished.startswith(prefix):
                polished = polished[len(prefix):].strip()

        # 去掉可能的 markdown 代码块标记
        if polished.startswith("```"):
            lines = polished.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            polished = "\n".join(lines)

        return {"polished_text": polished}
    except Exception as e:
        return JSONResponse(content={"error": f"AI 润色失败: {e}"}, status_code=500)


@router.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/submit-review")
async def repo_submit_review(owner: str, repo: str, pull_number: int, body: SubmitReviewBody, auth: AuthInfo = Depends(require_auth)):
    """将评审意见作为 PR Review 提交到 GitHub，告知 PR 作者评审结果"""
    if not body.review_text.strip():
        return JSONResponse(content={"error": "评审意见不能为空"}, status_code=400)

    # 获取 PR 的 head SHA
    try:
        async with httpx.AsyncClient(verify=False) as client:
            pr_resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}",
                headers={
                    "Authorization": f"Bearer {auth.github_token}",
                    "Accept": "application/vnd.github+json",
                },
            )
            pr_resp.raise_for_status()
            pr_data = pr_resp.json()
            head_sha = pr_data.get("head", {}).get("sha", "")
            if not head_sha:
                return JSONResponse(content={"error": "无法获取 PR head commit SHA"}, status_code=400)
    except Exception as e:
        return JSONResponse(content={"error": f"获取 PR 信息失败: {e}"}, status_code=500)

    # 提交 PR Review
    result = await create_pr_review(
        owner=owner,
        repo=repo,
        pull_number=pull_number,
        commit_id=head_sha,
        body=body.review_text[:2000],
        token=auth.github_token,
    )

    if result is None or "error" in result:
        err_msg = result.get("error", "提交评审到 GitHub 失败") if result else "提交评审到 GitHub 失败"
        return JSONResponse(content={"error": err_msg}, status_code=400)

    return {
        "ok": True,
        "message": "评审意见已提交到 PR",
        "review_id": result.get("id"),
        "html_url": result.get("html_url", f"https://github.com/{owner}/{repo}/pull/{pull_number}"),
    }
