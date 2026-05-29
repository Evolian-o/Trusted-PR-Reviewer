import json
import asyncio

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from sse_starlette.sse import EventSourceResponse

from services.github_adapter import parse_pr_url, fetch_pr
from services.chunking import chunk_pr as smart_chunk_pr
from services.prompt_builder import SYSTEM_PROMPT, build_user_prompt
from services.llm_providers.base import ReviewPrompt
from services.llm_providers.factory import get_provider, list_providers
from services.result_formatter import parse_llm_output, build_review_result
from services.database import (
    save_review, list_reviews, get_review, delete_review,
    add_monitored_repo, remove_monitored_repo, list_monitored_repos,
    save_email_config, get_email_config, get_all_settings, get_setting, set_setting,
)
from services.auth import (
    get_login_url, complete_auth, is_authenticated, clear_auth, get_user_info,
    get_token, get_user_id,
)
from models.review import FileReview
from services.scheduler import start_scheduler, stop_scheduler
from contextlib import asynccontextmanager
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    await stop_scheduler()


app = FastAPI(title="Trusted PR Reviewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── 认证端点 ──────────────────────────────────────────────

@app.get("/api/auth/login")
async def auth_login():
    return {"url": get_login_url()}


@app.get("/api/auth/callback")
async def auth_callback(code: str = Query(...)):
    try:
        await complete_auth(code)
        # 登录成功后自动启动调度器
        user_id = get_user_id()
        if user_id is not None:
            interval = int(await get_setting(user_id, "poll_interval_seconds", "300"))
            await start_scheduler(user_id, interval)
        return RedirectResponse(url="http://localhost:5173/dashboard")
    except RuntimeError as e:
        return {"error": str(e)}


@app.get("/api/auth/status")
async def auth_status():
    if is_authenticated():
        info = get_user_info()
        return {
            "authenticated": True,
            "login": info["user_login"],
            "avatar_url": info.get("avatar_url", ""),
            "user_id": info["user_id"],
        }
    return {"authenticated": False}


@app.post("/api/auth/logout")
async def auth_logout():
    clear_auth()
    return {"status": "ok"}


# ── 仓库 & 监控端点 ──────────────────────────────────────

@app.get("/api/repos")
async def repo_list():
    token = get_token()
    if not token:
        return {"error": "未认证"}, 401
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            "https://api.github.com/user/repos",
            params={"sort": "updated", "per_page": 100, "type": "all"},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        repos = resp.json()
        if not isinstance(repos, list):
            return {"error": "获取仓库失败"}, 400
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


@app.get("/api/monitor")
async def monitor_list():
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    repos = await list_monitored_repos(user_id)
    return {"repos": repos}


@app.post("/api/monitor")
async def monitor_add(data: dict):
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    owner = data.get("owner", "")
    repo = data.get("repo", "")
    if not owner or not repo:
        return {"error": "缺少 owner 或 repo"}, 400
    await add_monitored_repo(user_id, owner, repo)
    return {"status": "ok"}


@app.delete("/api/monitor/{repo_id}")
async def monitor_delete(repo_id: int):
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    deleted = await remove_monitored_repo(repo_id)
    if not deleted:
        return {"error": "记录不存在"}, 404
    return {"status": "ok"}


@app.get("/api/repos/{owner}/{repo}/pulls")
async def repo_pulls(owner: str, repo: str, state: str = "open"):
    token = get_token()
    if not token:
        return {"error": "未认证"}, 401
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.get(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            params={"state": state, "per_page": 30},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        data = resp.json()
        if not isinstance(data, list):
            return {"error": data.get("message", "获取 PR 失败")}, resp.status_code
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


@app.post("/api/repos/{owner}/{repo}/pulls")
async def repo_create_pr(owner: str, repo: str, data: dict):
    token = get_token()
    if not token:
        return {"error": "未认证"}, 401
    title = data.get("title", "")
    head = data.get("head", "")
    base = data.get("base", "main")
    if not title or not head:
        return {"error": "缺少 title 或 head"}, 400
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            json={"title": title, "head": head, "base": base},
            headers={
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
            },
        )
        pr = resp.json()
        if resp.status_code >= 400:
            return {"error": pr.get("message", "创建 PR 失败")}, resp.status_code
        return {"number": pr["number"], "html_url": pr["html_url"], "title": pr["title"]}


@app.get("/api/providers")
async def providers():
    names = list_providers()
    return {"providers": names}


async def event_stream(pr_url: str, provider_name: str, model: str | None):
    """SSE 事件流生成器：拉 PR → 分片 → LLM 逐文件评审 → 推送结果"""
    try:
        # Step 1: 解析 URL
        yield {"event": "status", "data": "正在解析 PR URL..."}
        owner, repo, pull_number = parse_pr_url(pr_url)

        # Step 2: 获取 PR
        yield {"event": "status", "data": f"正在获取 PR 信息: {owner}/{repo}#{pull_number}"}
        pr = await fetch_pr(owner, repo, pull_number, token=get_token())
        yield {
            "event": "progress",
            "data": json.dumps({
                "phase": "fetching",
                "current": 0,
                "total": len(pr.files),
                "message": f"已获取 {len(pr.files)} 个文件",
            }),
        }

        # Step 3: 按文件智能分片
        user_id = get_user_id() or 0
        max_chars = int(await get_setting(user_id, "chunk_max_chars", "8000"))
        merge_max_chars = int(await get_setting(user_id, "chunk_merge_max_chars", "6000"))
        max_lines = int(await get_setting(user_id, "chunk_max_lines", "2000"))
        strategy = await get_setting(user_id, "chunk_strategy", "auto")

        chunks = await smart_chunk_pr(
            pr, token=get_token(),
            max_chars=max_chars,
            merge_max_chars=merge_max_chars,
            fallback_max_lines=max_lines,
            strategy=strategy,
        )
        yield {"event": "status", "data": f"分片完成，共 {len(chunks)} 个片段待评审"}

        # Step 4: 获取 Provider
        provider = get_provider(provider_name)

        # Step 5: 逐个评审
        file_reviews = []
        for idx, fc in enumerate(chunks, start=1):
            yield {
                "event": "progress",
                "data": json.dumps({
                    "phase": "reviewing",
                    "current": idx,
                    "total": len(chunks),
                    "file": fc.filename,
                    "language": fc.language,
                }),
            }

            user_prompt = build_user_prompt(pr, fc)
            prompt = ReviewPrompt(system=SYSTEM_PROMPT, user=user_prompt)

            full_text = ""
            try:
                async for token in provider.review(prompt, model=model):
                    full_text += token
                    yield {"event": "token", "data": token}
                    await asyncio.sleep(0)
            except Exception as e:
                msg = str(e).strip() or f"{type(e).__name__}(无详细错误信息)"
                yield {"event": "review_error", "data": f"LLM 调用失败 [{fc.filename}]: {msg}"}
                continue

            try:
                summary, issues, suggestions = parse_llm_output(full_text, fc.filename)
                file_reviews.append(FileReview(
                    file=fc.filename,
                    summary=summary,
                    issues=issues,
                    suggestions=suggestions,
                ))
            except Exception as e:
                yield {"event": "review_error", "data": f"解析评审结果失败 [{fc.filename}]: {e}"}
                continue

            yield {
                "event": "file_done",
                "data": json.dumps({
                    "file": fc.filename,
                    "issues_count": len(issues),
                    "progress": f"{idx}/{len(chunks)}",
                }),
            }

        # Step 6: 汇总结果
        result = build_review_result(
            pr_title=pr.title,
            owner=owner, repo=repo, pull_number=pull_number,
            files_changed=len(pr.files),
            additions=pr.additions, deletions=pr.deletions,
            file_reviews=file_reviews,
        )

        yield {
            "event": "done",
            "data": result.model_dump_json(),
        }

        # 持久化保存
        try:
            review_id = await save_review(pr_url, provider_name, model, result)
        except Exception:
            pass  # 保存失败不影响评审响应

    except ValueError as e:
        yield {"event": "review_error", "data": str(e) or "ValueError: 无详细错误信息"}
    except RuntimeError as e:
        yield {"event": "review_error", "data": str(e) or "RuntimeError: 无详细错误信息"}
    except Exception as e:
        yield {"event": "review_error", "data": f"未知错误: {str(e) or type(e).__name__}"}


@app.get("/api/review")
async def review(
    url: str = Query(..., description="GitHub PR URL"),
    provider: str = Query("ollama", description="LLM Provider"),
    model: str | None = Query(None, description="模型名称"),
):
    return EventSourceResponse(event_stream(url, provider, model))


@app.get("/api/history")
async def history(owner: str | None = None, repo: str | None = None):
    rows = await list_reviews(owner=owner, repo=repo)
    return {"reviews": rows}


@app.get("/api/history/{review_id}")
async def history_detail(review_id: int):
    row = await get_review(review_id)
    if not row:
        return {"error": "记录不存在"}, 404
    return row


@app.delete("/api/history/{review_id}")
async def history_delete(review_id: int):
    deleted = await delete_review(review_id)
    if not deleted:
        return {"error": "记录不存在"}, 404
    return {"status": "ok"}


# ── 设置端点 ──────────────────────────────────────────────

@app.get("/api/settings")
async def settings_get():
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    kv = await get_all_settings(user_id)
    email = await get_email_config(user_id)
    return {
        "poll_interval_seconds": kv.get("poll_interval_seconds", "300"),
        "default_provider": kv.get("default_provider", "ollama"),
        "default_model": kv.get("default_model", ""),
        "chunk_max_chars": kv.get("chunk_max_chars", "8000"),
        "chunk_merge_max_chars": kv.get("chunk_merge_max_chars", "6000"),
        "chunk_max_lines": kv.get("chunk_max_lines", "2000"),
        "chunk_strategy": kv.get("chunk_strategy", "auto"),
        "email": {
            "to_email": email.get("to_email", "") if email else "",
            "password": email.get("password", "") if email else "",
            "enabled": bool(email.get("enabled")) if email else False,
        },
    }


@app.put("/api/settings")
async def settings_update(data: dict):
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401

    # 保存通用设置
    for key in (
        "poll_interval_seconds", "default_provider", "default_model",
        "chunk_max_chars", "chunk_merge_max_chars", "chunk_max_lines", "chunk_strategy",
    ):
        if key in data:
            await set_setting(user_id, key, str(data[key]))

    # 保存邮件配置
    email = data.get("email")
    if email:
        await save_email_config(user_id, email)

    # 重启调度器（使用新的轮询间隔）
    interval = int(data.get("poll_interval_seconds", 300))
    await start_scheduler(user_id, interval)

    return {"status": "ok"}


@app.post("/api/settings/email/test")
async def email_test(data: dict):
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    from services.email_notifier import send_test_email
    try:
        await send_test_email(data)
        return {"status": "ok"}
    except Exception as e:
        return {"error": str(e)}
