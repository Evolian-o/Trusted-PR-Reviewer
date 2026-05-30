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

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
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
)
from services.auth import (
    get_login_url, complete_auth, is_authenticated, clear_auth, get_user_info,
    get_token, get_user_id, is_token_expired,
)
from services.scheduler import start_scheduler, stop_scheduler, get_scheduler_status, restore_scheduler

# 评审端点频率限制: 每分钟最多 10 次
_review_limiter = RateLimiter(max_requests=10, window_seconds=60)
from contextlib import asynccontextmanager
import httpx


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时尝试恢复调度器（从 DB 读取已配置的 user）
    try:
        from services.database import get_all_settings
        # 尝试从 DB 恢复最近活跃用户的调度器
        from services.database import get_db
        db = await get_db()
        cursor = await db.execute(
            "SELECT DISTINCT user_id FROM monitored_repos WHERE active=1 LIMIT 1"
        )
        row = await cursor.fetchone()
        if row:
            await restore_scheduler(row[0])
    except Exception:
        pass
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
        expired = is_token_expired()
        return {
            "authenticated": True,
            "login": info.get("user_login", ""),
            "avatar_url": info.get("avatar_url", ""),
            "user_id": info.get("user_id"),
            "token_expired": expired,
            "token_age_seconds": info.get("token_age_seconds", 0),
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


# ── 调度器端点 ──────────────────────────────────────────────

@app.get("/api/scheduler/status")
async def scheduler_status():
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    status = get_scheduler_status()
    # 补充监控仓库数量
    repos = await list_monitored_repos(user_id)
    status["monitored_repos"] = len([r for r in repos if r.get("active")])
    return status


@app.post("/api/scheduler/start")
async def scheduler_start():
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    interval = int(await get_setting(user_id, "poll_interval_seconds", "300"))
    await start_scheduler(user_id, interval)
    return {"status": "ok", "message": f"调度器已启动，间隔 {interval}s"}


@app.post("/api/scheduler/stop")
async def scheduler_stop():
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401
    await stop_scheduler()
    return {"status": "ok", "message": "调度器已停止"}


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
    """返回所有可用提供商（内置 + 自定义），含元数据"""
    user_id = get_user_id() or 0
    if user_id:
        await load_custom_providers(user_id)
    return {"providers": list_providers_with_meta()}


@app.get("/api/providers/{name}/models")
async def provider_models(name: str):
    """获取指定提供商的模型列表（代理到上游 API）"""
    user_id = get_user_id() or 0
    if user_id:
        await load_custom_providers(user_id)
    try:
        provider = get_provider(name)
    except ValueError:
        return {"error": f"未知提供商: {name}"}, 404

    if hasattr(provider, "list_models"):
        models = await provider.list_models()
        return {"models": models}
    return {"models": []}


@app.post("/api/providers/custom")
async def provider_create(data: dict):
    """添加自定义 OpenAI 兼容提供商"""
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401

    name = (data.get("name") or "").strip().lower()
    if not name:
        return {"error": "name 不能为空"}, 400
    if is_builtin(name):
        return {"error": f"'{name}' 是内置提供商，不能覆盖"}, 409

    display_name = (data.get("display_name") or "").strip()
    base_url = (data.get("base_url") or "").strip()
    api_key = (data.get("api_key") or "").strip()
    default_model = (data.get("default_model") or "").strip()

    if not display_name or not base_url or not api_key:
        return {"error": "display_name / base_url / api_key 为必填"}, 400

    # 检查是否已存在同名自定义提供商
    existing = await db_get_custom_provider(user_id, name)
    if existing:
        return {"error": f"'{name}' 已存在"}, 409

    api_key_enc = encrypt(api_key)
    row_data = {
        "name": name,
        "display_name": display_name,
        "base_url": base_url,
        "api_key_enc": api_key_enc,
        "default_model": default_model,
        "timeout": data.get("timeout", 120),
    }
    await db_create_custom_provider(user_id, row_data)

    # 注册到内存
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    provider = OpenAICompatibleProvider(
        name=name, base_url=base_url, api_key=api_key,
        default_model=default_model,
        timeout=data.get("timeout", 120),
        is_builtin=False,
    )
    register_custom_provider(name, provider)
    return {"status": "ok", "name": name}


@app.put("/api/providers/custom/{name}")
async def provider_update(name: str, data: dict):
    """更新自定义提供商配置"""
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401

    if is_builtin(name):
        return {"error": f"'{name}' 是内置提供商，不可修改"}, 403

    existing = await db_get_custom_provider(user_id, name)
    if not existing:
        return {"error": f"'{name}' 不存在"}, 404

    updates = {}
    for field in ("display_name", "base_url", "default_model", "timeout", "is_enabled"):
        if field in data:
            updates[field] = data[field]
    if "api_key" in data and data["api_key"]:
        updates["api_key_enc"] = encrypt(data["api_key"])

    if updates:
        await db_update_custom_provider(user_id, name, updates)

    # 重新加载到内存（先移除旧的，再注册新的）
    unregister_custom_provider(name)
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    row = await db_get_custom_provider(user_id, name)
    if row and row.get("is_enabled"):
        api_key = decrypt(row["api_key_enc"])
        provider = OpenAICompatibleProvider(
            name=name, base_url=row["base_url"], api_key=api_key,
            default_model=row.get("default_model", ""),
            timeout=row.get("timeout", 120),
            is_builtin=False,
        )
        register_custom_provider(name, provider)

    return {"status": "ok"}


@app.delete("/api/providers/custom/{name}")
async def provider_delete(name: str):
    """删除自定义提供商"""
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401

    if is_builtin(name):
        return {"error": f"'{name}' 是内置提供商，不可删除"}, 403

    deleted = await db_delete_custom_provider(user_id, name)
    if not deleted:
        return {"error": f"'{name}' 不存在"}, 404

    unregister_custom_provider(name)
    return {"status": "ok"}


@app.post("/api/providers/custom/{name}/test")
async def provider_test(name: str, data: dict | None = None):
    """测试指定提供商的连接"""
    user_id = get_user_id()
    if user_id is None:
        return {"error": "未认证"}, 401

    from services.llm_providers.openai_compatible import OpenAICompatibleProvider

    if is_builtin(name):
        try:
            provider = get_provider(name)
        except ValueError:
            return {"ok": False, "error": f"'{name}' 未配置 API Key"}
    else:
        # 从请求体或 DB 获取配置
        if data:
            api_key = data.get("api_key", "")
            base_url = data.get("base_url", "")
        else:
            row = await db_get_custom_provider(user_id, name)
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


async def event_stream(pr_url: str, provider_name: str, model: str | None):
    """SSE 事件流 — 薄包装，委托给 ReviewOrchestrator"""
    from services.review_orchestrator import run_review_pipeline

    if not _review_limiter.is_allowed("review"):
        yield {"event": "review_error", "data": "请求过于频繁，请稍后再试（每分钟最多 10 次）"}
        return

    try:
        async for event in run_review_pipeline(
            pr_url, provider_name, model,
            token=get_token(),
            user_id=get_user_id() or 0,
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
):
    return EventSourceResponse(event_stream(url, provider, model))


@app.get("/api/history")
async def history(
    keyword: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
):
    rows = await list_reviews(keyword=keyword, from_date=from_date, to_date=to_date)
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
    try:
        interval = int(data.get("poll_interval_seconds", 300))
        await start_scheduler(user_id, interval)
    except Exception:
        pass  # 调度器重启失败不影响设置保存

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
