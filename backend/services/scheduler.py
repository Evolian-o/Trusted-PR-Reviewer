import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.database import (
    get_active_monitored_repos, update_monitor_sha, get_setting,
    get_all_user_ids_with_active_monitors,
)
from services.llm_providers.factory import get_provider
from services.review_orchestrator import run_review_pipeline_sync

logger = logging.getLogger("scheduler")

_schedulers: dict[int, AsyncIOScheduler] = {}
_intervals: dict[int, int] = {}


async def auto_review_pr(owner: str, repo: str, pull_number: int, pr_info: dict, github_token: str, user_id: int = 0) -> None:
    """对单个 PR 执行完整评审（委托给 ReviewOrchestrator）"""
    try:
        provider = await _get_default_provider(user_id)
        model = await _get_default_model(provider.name, user_id)
        pr_url = f"https://github.com/{owner}/{repo}/pull/{pull_number}"

        logger.info(f"自动评审开始: {owner}/{repo}#{pull_number} provider={provider.name} model={model}")

        result_json = await run_review_pipeline_sync(
            pr_url, provider.name, model,
            token=github_token, user_id=user_id,
        )

        if result_json:
            import json
            result = json.loads(result_json)
            logger.info(f"自动评审完成: {owner}/{repo}#{pull_number} 风险={result.get('risk_level')} 问题={len(result.get('issues', []))}")
        else:
            logger.warning(f"自动评审未产出结果: {owner}/{repo}#{pull_number}")
    except Exception as e:
        logger.error(f"自动评审失败 {owner}/{repo}#{pull_number}: {e}")


async def _get_default_provider(user_id: int):
    provider_name = await get_setting(user_id, "default_provider", "deepseek")
    return get_provider(provider_name, user_id=user_id)


async def _get_default_model(provider_name: str, user_id: int) -> str | None:
    model = await get_setting(user_id, "default_model", "")
    if model:
        return model
    try:
        provider = get_provider(provider_name, user_id=user_id)
        return provider.default_model or None
    except (ValueError, AttributeError):
        return None


async def _get_github_token_for_user(user_id: int) -> str | None:
    """从 sessions 表获取用户的 github token（取最近一条）"""
    from services.database import get_db
    db = await get_db()
    try:
        db.row_factory = None
        cursor = await db.execute(
            "SELECT github_token FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1",
            (user_id,),
        )
        row = await cursor.fetchone()
        return row[0] if row else None
    finally:
        await db.close()


async def _poll_repos(user_id: int) -> None:
    """轮询指定用户所有活跃监控仓库的 PR"""
    repos = await get_active_monitored_repos(user_id)
    if not repos:
        return

    token = await _get_github_token_for_user(user_id)
    if not token:
        logger.warning(f"调度器 user_id={user_id}: 未找到有效 GitHub token，跳过")
        return

    # 暂时用 scheduler 内部的 github_get 实现
    import httpx
    async def _github_get(path: str, params: dict | None = None) -> dict | list:
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

    for repo in repos:
        try:
            pulls = await _github_get(
                f"/repos/{repo['owner']}/{repo['repo']}/pulls",
                {"state": "open", "sort": "updated", "per_page": 20},
            )
            if not isinstance(pulls, list):
                continue

            for pr in pulls:
                head_sha = pr["head"]["sha"]
                if head_sha != repo.get("last_pr_sha"):
                    logger.info(f"检测到 PR 变更: {repo['owner']}/{repo['repo']}#{pr['number']}")
                    await auto_review_pr(
                        repo["owner"], repo["repo"], pr["number"], pr,
                        github_token=token, user_id=user_id,
                    )
                    await update_monitor_sha(repo["id"], head_sha)
        except Exception as e:
            logger.error(f"轮询失败 {repo['owner']}/{repo['repo']}: {e}")


async def start_scheduler(user_id: int, interval_seconds: int = 300) -> None:
    """为指定用户启动调度器（如果已存在则先停止旧的）"""
    global _schedulers, _intervals
    await stop_scheduler(user_id)

    _intervals[user_id] = interval_seconds
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        _poll_repos, "interval", seconds=interval_seconds, args=[user_id],
        id="pr_poll", replace_existing=True,
    )
    scheduler.start()
    _schedulers[user_id] = scheduler
    logger.info(f"调度器已启动: user_id={user_id} interval={interval_seconds}s")


async def stop_scheduler(user_id: int) -> None:
    """停止指定用户的调度器"""
    global _schedulers, _intervals
    sched = _schedulers.pop(user_id, None)
    _intervals.pop(user_id, None)
    if sched is not None:
        sched.shutdown(wait=False)
        logger.info(f"调度器已停止: user_id={user_id}")


async def stop_all_schedulers() -> None:
    """停止所有用户的调度器"""
    for user_id in list(_schedulers.keys()):
        await stop_scheduler(user_id)


def get_scheduler_status(user_id: int) -> dict:
    """查询指定用户的调度器运行状态"""
    sched = _schedulers.get(user_id)
    if sched is None:
        return {"running": False, "user_id": user_id, "interval_seconds": 0}
    return {
        "running": bool(sched.running),
        "user_id": user_id,
        "interval_seconds": _intervals.get(user_id, 0),
    }


async def restore_all_schedulers() -> None:
    """服务启动时恢复所有有活跃监控仓库的用户的调度器"""
    user_ids = await get_all_user_ids_with_active_monitors()
    for user_id in user_ids:
        try:
            interval = int(await get_setting(user_id, "poll_interval_seconds", "300"))
            await start_scheduler(user_id, interval)
            logger.info(f"已恢复调度器: user_id={user_id}")
        except Exception as e:
            logger.warning(f"恢复调度器失败 user_id={user_id}: {e}")
