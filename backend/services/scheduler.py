import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler

from services.auth import get_token
from services.database import (
    get_active_monitored_repos, update_monitor_sha, get_setting,
)
from services.github_client import github_get
from services.llm_providers.factory import get_provider
from services.review_orchestrator import run_review_pipeline_sync

logger = logging.getLogger("scheduler")

_scheduler: AsyncIOScheduler | None = None
_user_id: int | None = None


async def auto_review_pr(owner: str, repo: str, pull_number: int, pr_info: dict) -> None:
    """对单个 PR 执行完整评审（委托给 ReviewOrchestrator）"""
    try:
        provider = await _get_default_provider()
        model = await _get_default_model(provider.name)
        pr_url = f"https://github.com/{owner}/{repo}/pull/{pull_number}"
        uid = _user_id or 0

        logger.info(f"自动评审开始: {owner}/{repo}#{pull_number} provider={provider.name} model={model}")

        result_json = await run_review_pipeline_sync(
            pr_url, provider.name, model,
            token=get_token(), user_id=uid,
        )

        if result_json:
            import json
            result = json.loads(result_json)
            logger.info(f"自动评审完成: {owner}/{repo}#{pull_number} 风险={result.get('risk_level')} 问题={len(result.get('issues', []))}")
        else:
            logger.warning(f"自动评审未产出结果: {owner}/{repo}#{pull_number}")
    except Exception as e:
        logger.error(f"自动评审失败 {owner}/{repo}#{pull_number}: {e}")


async def _get_default_provider():
    provider_name = await get_setting(_user_id or 0, "default_provider", "deepseek")
    return get_provider(provider_name)


async def _get_default_model(provider_name: str) -> str | None:
    model = await get_setting(_user_id or 0, "default_model", "")
    if model:
        return model
    defaults = {"ollama": "qwen3.5:latest", "deepseek": "deepseek-chat",
                 "doubao": "doubao-seed-2-0-pro-260215", "openai": "gpt-4o-mini"}
    return defaults.get(provider_name)


async def _poll_repos(user_id: int) -> None:
    """轮询指定用户所有活跃监控仓库的 PR"""
    repos = await get_active_monitored_repos(user_id)
    if not repos:
        return

    for repo in repos:
        try:
            pulls = await github_get(
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
                    )
                    await update_monitor_sha(repo["id"], head_sha)
        except Exception as e:
            logger.error(f"轮询失败 {repo['owner']}/{repo['repo']}: {e}")


async def start_scheduler(user_id: int, interval_seconds: int = 300) -> None:
    global _scheduler, _user_id, _last_interval
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)

    _user_id = user_id
    _last_interval = interval_seconds
    _scheduler = AsyncIOScheduler()
    _scheduler.add_job(
        _poll_repos, "interval", seconds=interval_seconds, args=[user_id],
        id="pr_poll", replace_existing=True,
    )
    _scheduler.start()
    logger.info(f"调度器已启动: user_id={user_id} interval={interval_seconds}s")


def get_scheduler_status() -> dict:
    """查询调度器运行状态"""
    global _scheduler, _user_id
    if _scheduler is None:
        return {"running": False, "user_id": _user_id, "interval_seconds": 0}
    return {
        "running": bool(_scheduler.running),
        "user_id": _user_id,
        "interval_seconds": _last_interval,
    }


_last_interval: int = 300


async def restore_scheduler(user_id: int) -> dict:
    """服务启动时恢复调度器（从 DB 读取配置）"""
    interval = int(await get_setting(user_id, "poll_interval_seconds", "300"))
    await start_scheduler(user_id, interval)
    return {
        "running": True,
        "user_id": user_id,
        "interval_seconds": interval,
        "message": "调度器已恢复",
    }


async def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("调度器已停止")
