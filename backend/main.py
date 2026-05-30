import json
import asyncio
import logging
import os
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(Path(__file__).parent / "backend.log", encoding="utf-8"),
    ],
)

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"), override=True)

from fastapi import FastAPI, Query, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, JSONResponse
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from services.llm_providers.factory import (
    get_provider, list_providers_with_meta, load_custom_providers,
    register_custom_provider, unregister_custom_provider, is_builtin,
    get_provider_info,
)
from services.llm_providers.crypto import encrypt, decrypt
from services.rate_limiter import RateLimiter
from services.database import (
    list_reviews, get_review, delete_review,
    add_monitored_repo, remove_monitored_repo, list_monitored_repos,
    save_email_config, get_email_config, get_all_settings, get_setting, set_setting,
    list_custom_providers as db_list_custom_providers,
    get_custom_provider as db_get_custom_provider,
    create_custom_provider as db_create_custom_provider,
    update_custom_provider as db_update_custom_provider,
    delete_custom_provider as db_delete_custom_provider,
    get_repo_stats,
    get_review_by_share_token,
)
from services.auth import (
    get_login_url, complete_auth,
    AuthInfo, verify_token,
    destroy_session,
    SESSION_MAX_AGE_SECONDS,
)
from services.auth_middleware import require_auth, optional_auth
from services.scheduler import start_scheduler, stop_scheduler, get_scheduler_status, restore_all_schedulers
from services.github_client import check_repo_exists, merge_pr

# 评审端点频率限制: 每分钟最多 10 次
_review_limiter = RateLimiter(max_requests=10, window_seconds=60)
from contextlib import asynccontextmanager
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger("main")
    # 恢复所有有活跃监控仓库的用户的调度器
    try:
        await restore_all_schedulers()
    except Exception as e:
        logger.warning(f"恢复调度器失败: {e}")
    yield
    # 停止所有调度器
    try:
        from services.scheduler import stop_all_schedulers
        await stop_all_schedulers()
    except Exception:
        pass


app = FastAPI(title="Trusted PR Reviewer", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request, exc: Exception):
    """统一异常处理 — 所有未捕获异常转 JSON 错误响应"""
    logger = logging.getLogger("main")
    logger.exception(f"未处理异常: {request.method} {request.url.path} — {exc}")
    from fastapi.responses import JSONResponse
    status = 500
    if isinstance(exc, ValueError):
        status = 400
    elif isinstance(exc, RuntimeError):
        status = 500
    return JSONResponse(
        status_code=status,
        content={"error": str(exc) or type(exc).__name__},
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
        session_id, auth = await complete_auth(code)
        # 登录成功后自动启动调度器
        try:
            interval = int(await get_setting(auth.user_id, "poll_interval_seconds", "300"))
            await start_scheduler(auth.user_id, interval)
        except Exception:
            pass
        response = RedirectResponse(url="http://localhost:5173/dashboard")
        response.set_cookie(
            key="pr_session",
            value=session_id,
            httponly=True,
            samesite="lax",
            max_age=SESSION_MAX_AGE_SECONDS,
            secure=False,  # 本地开发用 HTTP
        )
        return response
    except RuntimeError as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)


@app.get("/api/auth/status")
async def auth_status(auth: AuthInfo | None = Depends(optional_auth)):
    if auth is not None:
        expired = auth.is_token_expired()
        return {
            "authenticated": True,
            "login": auth.user_login,
            "avatar_url": auth.avatar_url,
            "user_id": auth.user_id,
            "token_expired": expired,
        }
    return {"authenticated": False}


@app.post("/api/auth/logout")
async def auth_logout(auth: AuthInfo | None = Depends(optional_auth)):
    if auth is not None:
        await destroy_session(auth.session_id)  # type: ignore
    response = JSONResponse(content={"status": "ok"})
    response.delete_cookie("pr_session")
    return response


# ── 仓库 & 监控端点 ──────────────────────────────────────

@app.get("/api/repos")
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


@app.get("/api/monitor")
async def monitor_list(auth: AuthInfo = Depends(require_auth)):
    repos = await list_monitored_repos(auth.user_id)
    return {"repos": repos}


@app.post("/api/monitor")
async def monitor_add(data: dict, auth: AuthInfo = Depends(require_auth)):
    owner = data.get("owner", "")
    repo = data.get("repo", "")
    if not owner or not repo:
        return JSONResponse(content={"error": "缺少 owner 或 repo"}, status_code=400)
    if not await check_repo_exists(owner, repo, token=auth.github_token):
        return JSONResponse(content={"error": f"仓库 {owner}/{repo} 不存在或无权访问"}, status_code=404)
    await add_monitored_repo(auth.user_id, owner, repo)
    return {"status": "ok"}


@app.delete("/api/monitor/{repo_id}")
async def monitor_delete(repo_id: int, auth: AuthInfo = Depends(require_auth)):
    deleted = await remove_monitored_repo(repo_id)
    if not deleted:
        return JSONResponse(content={"error": "记录不存在"}, status_code=404)
    return {"status": "ok"}


# ── 调度器端点 ──────────────────────────────────────────────

@app.get("/api/scheduler/status")
async def scheduler_status(auth: AuthInfo = Depends(require_auth)):
    status = get_scheduler_status(auth.user_id)
    repos = await list_monitored_repos(auth.user_id)
    status["monitored_repos"] = len([r for r in repos if r.get("active")])
    return status


@app.post("/api/scheduler/start")
async def scheduler_start(auth: AuthInfo = Depends(require_auth)):
    interval = int(await get_setting(auth.user_id, "poll_interval_seconds", "300"))
    await start_scheduler(auth.user_id, interval)
    return {"status": "ok", "message": f"调度器已启动，间隔 {interval}s"}


@app.post("/api/scheduler/stop")
async def scheduler_stop(auth: AuthInfo = Depends(require_auth)):
    await stop_scheduler(auth.user_id)
    return {"status": "ok", "message": "调度器已停止"}


@app.get("/api/repos/{owner}/{repo}/pulls")
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


@app.post("/api/repos/{owner}/{repo}/pulls")
async def repo_create_pr(owner: str, repo: str, data: dict, auth: AuthInfo = Depends(require_auth)):
    title = data.get("title", "")
    head = data.get("head", "")
    base = data.get("base", "main")
    if not title or not head:
        return JSONResponse(content={"error": "缺少 title 或 head"}, status_code=400)
    async with httpx.AsyncClient(verify=False) as client:
        resp = await client.post(
            f"https://api.github.com/repos/{owner}/{repo}/pulls",
            json={"title": title, "head": head, "base": base},
            headers={
                "Authorization": f"Bearer {auth.github_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        pr = resp.json()
        if resp.status_code >= 400:
            return JSONResponse(content={"error": pr.get("message", "创建 PR 失败")}, status_code=resp.status_code)
        return {"number": pr["number"], "html_url": pr["html_url"], "title": pr["title"]}


class MergeBody(BaseModel):
    merge_method: str = "merge"


@app.post("/api/repos/{owner}/{repo}/pulls/{pull_number}/merge")
async def repo_merge_pr(owner: str, repo: str, pull_number: int, body: MergeBody, auth: AuthInfo = Depends(require_auth)):
    """合并 PR — merge_method: merge / squash / rebase"""
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


@app.get("/api/providers")
async def providers(auth: AuthInfo | None = Depends(optional_auth)):
    """返回所有可用提供商（内置 + 自定义），含元数据"""
    user_id = auth.user_id if auth else 0
    if user_id:
        await load_custom_providers(user_id)
    return {"providers": list_providers_with_meta()}


@app.get("/api/providers/{name}/models")
async def provider_models(name: str, auth: AuthInfo | None = Depends(optional_auth)):
    """获取指定提供商的模型列表（代理到上游 API）"""
    user_id = auth.user_id if auth else 0
    if user_id:
        await load_custom_providers(user_id)
    try:
        provider = get_provider(name, user_id=user_id)
    except ValueError:
        return JSONResponse(content={"error": f"未知提供商: {name}"}, status_code=404)

    if hasattr(provider, "list_models"):
        models = await provider.list_models()
        return {"models": models}
    return {"models": []}


@app.post("/api/providers/custom")
async def provider_create(data: dict, auth: AuthInfo = Depends(require_auth)):
    """添加自定义 OpenAI 兼容提供商"""
    name = (data.get("name") or "").strip().lower()
    if not name:
        return JSONResponse(content={"error": "name 不能为空"}, status_code=400)
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不能覆盖"}, status_code=409)

    display_name = (data.get("display_name") or "").strip()
    base_url = (data.get("base_url") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    default_model = (data.get("default_model") or "").strip()

    if not display_name or not base_url or not api_key:
        return JSONResponse(content={"error": "display_name / base_url / api_key 为必填"}, status_code=400)

    existing = await db_get_custom_provider(auth.user_id, name)
    if existing:
        return JSONResponse(content={"error": f"'{name}' 已存在"}, status_code=409)

    api_key_enc = encrypt(api_key)
    row_data = {
        "name": name,
        "display_name": display_name,
        "base_url": base_url,
        "api_key_enc": api_key_enc,
        "default_model": default_model,
        "timeout": data.get("timeout", 120),
    }
    await db_create_custom_provider(auth.user_id, row_data)

    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    provider = OpenAICompatibleProvider(
        name=name, base_url=base_url, api_key=api_key,
        default_model=default_model,
        timeout=data.get("timeout", 120),
        is_builtin=False,
    )
    register_custom_provider(auth.user_id, name, provider)
    return {"status": "ok", "name": name}


@app.put("/api/providers/custom/{name}")
async def provider_update(name: str, data: dict, auth: AuthInfo = Depends(require_auth)):
    """更新自定义提供商配置"""
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不可修改"}, status_code=403)

    existing = await db_get_custom_provider(auth.user_id, name)
    if not existing:
        return JSONResponse(content={"error": f"'{name}' 不存在"}, status_code=404)

    updates = {}
    for field in ("display_name", "base_url", "default_model", "timeout", "is_enabled"):
        if field in data:
            updates[field] = data[field]
    if "api_key" in data and data["api_key"]:
        updates["api_key_enc"] = encrypt(data["api_key"])

    if updates:
        await db_update_custom_provider(auth.user_id, name, updates)

    unregister_custom_provider(name, user_id=auth.user_id)
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    row = await db_get_custom_provider(auth.user_id, name)
    if row and row.get("is_enabled"):
        api_key = decrypt(row["api_key_enc"])
        provider = OpenAICompatibleProvider(
            name=name, base_url=row["base_url"], api_key=api_key,
            default_model=row.get("default_model", ""),
            timeout=row.get("timeout", 120),
            is_builtin=False,
        )
        register_custom_provider(auth.user_id, name, provider)

    return {"status": "ok"}


@app.delete("/api/providers/custom/{name}")
async def provider_delete(name: str, auth: AuthInfo = Depends(require_auth)):
    """删除自定义提供商"""
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不可删除"}, status_code=403)

    deleted = await db_delete_custom_provider(auth.user_id, name)
    if not deleted:
        return JSONResponse(content={"error": f"'{name}' 不存在"}, status_code=404)

    unregister_custom_provider(name, user_id=auth.user_id)
    return {"status": "ok"}


@app.post("/api/providers/custom/{name}/test")
async def provider_test(name: str, data: dict | None = None, auth: AuthInfo = Depends(require_auth)):
    """测试指定提供商的连接"""
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider

    if is_builtin(name):
        try:
            provider = get_provider(name)
        except ValueError:
            return {"ok": False, "error": f"'{name}' 未配置 API Key"}
    else:
        if data:
            api_key = data.get("api_key", "")
            base_url = data.get("base_url", "")
        else:
            row = await db_get_custom_provider(auth.user_id, name)
            if not row:
                return {"ok": False, "error": f"'{name}' 不存在"}
            api_key = decrypt(row["api_key_enc"])
            base_url = row["base_url"]

        provider = OpenAICompatibleProvider(
            name=name, base_url=base_url, api_key=api_key,
            default_model="", is_builtin=False,
        )

    ok = await provider.health_check()
    return {"ok": ok} if ok else {"ok": False, "error": "连接失败"}


async def event_stream(pr_url: str, provider_name: str, model: str | None, dims: str | None, token: str | None = None, user_id: int = 0, compare_model: str | None = None):
    """SSE 事件流 — 薄包装，委托给 ReviewOrchestrator"""
    from services.review_orchestrator import run_review_pipeline

    if not _review_limiter.is_allowed("review"):
        yield {"event": "review_error", "data": "请求过于频繁，请稍后再试（每分钟最多 10 次）"}
        return

    try:
        async for event in run_review_pipeline(
            pr_url, provider_name, model,
            token=token,
            user_id=user_id,
            dimensions=dims.split(",") if dims else None,
            compare_model=compare_model,
        ):
            yield event
    except ValueError as e:
        yield {"event": "review_error", "data": str(e) or "ValueError: 无详细错误信息"}
    except RuntimeError as e:
        yield {"event": "review_error", "data": str(e) or "RuntimeError: 无详细错误信息"}
    except Exception as e:
        yield {"event": "review_error", "data": f"未知错误: {str(e) or type(e).__name__}"}


@app.get("/api/review")
async def review(
    url: str = Query(..., description="GitHub PR URL"),
    provider: str = Query("deepseek", description="LLM Provider"),
    model: str | None = Query(None, description="模型名称"),
    dims: str | None = Query(None, description="评审维度 (逗号分隔: bug,security,performance,style)"),
    compare_model: str | None = Query(None, description="对比模型名称"),
    auth: AuthInfo | None = Depends(optional_auth),
):
    return EventSourceResponse(event_stream(
        url, provider, model, dims,
        token=auth.github_token if auth else None,
        user_id=auth.user_id if auth else 0,
        compare_model=compare_model,
    ))


@app.get("/api/history")
async def history(
    keyword: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    auth: AuthInfo = Depends(require_auth),
):
    rows = await list_reviews(keyword=keyword, from_date=from_date, to_date=to_date, user_id=auth.user_id)
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


@app.get("/api/share/{token}")
async def shared_review(token: str):
    """公开分享的评审报告（无需认证）"""
    row = await get_review_by_share_token(token)
    if not row:
        return {"error": "分享链接无效或已过期"}, 404
    try:
        result = json.loads(row["result_json"])
    except (json.JSONDecodeError, TypeError):
        return {"error": "数据损坏"}, 500
    result["share_token"] = token
    result["created_at"] = row.get("created_at", "")
    return result


@app.get("/api/history/stats")
async def history_stats(owner: str, repo: str):
    """返回指定仓库最近 5 次评审的趋势数据"""
    rows = await get_repo_stats(owner, repo, limit=5)
    trend = []
    for row in rows:
        entry = {
            "id": row["id"],
            "pr_title": row["pr_title"],
            "pull_number": row["pull_number"],
            "risk_level": row["risk_level"],
            "issue_count": row["issue_count"],
            "suggestion_count": row["suggestion_count"],
            "files_changed": row["files_changed"],
            "additions": row["additions"],
            "deletions": row["deletions"],
            "created_at": row["created_at"],
        }
        # 尝试解析 scores
        try:
            data = json.loads(row["result_json"])
            entry["scores"] = data.get("scores", {})
        except (json.JSONDecodeError, TypeError):
            entry["scores"] = {}
        trend.append(entry)
    return {"trend": trend}


# ── 设置端点 ──────────────────────────────────────────────

@app.get("/api/settings")
async def settings_get(auth: AuthInfo = Depends(require_auth)):
    kv = await get_all_settings(auth.user_id)
    email = await get_email_config(auth.user_id)
    return {
        "poll_interval_seconds": kv.get("poll_interval_seconds", "300"),
        "default_provider": kv.get("default_provider", "deepseek"),
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
async def settings_update(data: dict, auth: AuthInfo = Depends(require_auth)):
    for key in (
        "poll_interval_seconds", "default_provider", "default_model",
        "chunk_max_chars", "chunk_merge_max_chars", "chunk_max_lines", "chunk_strategy",
    ):
        if key in data:
            await set_setting(auth.user_id, key, str(data[key]))

    email = data.get("email")
    if email:
        await save_email_config(auth.user_id, email)

    try:
        interval = int(data.get("poll_interval_seconds", 300))
        await start_scheduler(auth.user_id, interval)
    except Exception:
        pass

    return {"status": "ok"}


@app.post("/api/settings/email/test")
async def email_test(data: dict, auth: AuthInfo = Depends(require_auth)):
    from services.email_notifier import send_test_email
    try:
        await send_test_email(data)
        return {"status": "ok"}
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=500)
