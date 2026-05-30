"""评审流水线编排器 — 拉 PR → 分片 → LLM 评审 → 保存 → 通知"""
import json
import asyncio
import logging

from services.github_adapter import parse_pr_url, fetch_pr
from services.chunking import chunk_pr as smart_chunk_pr
from services.prompt_builder import build_system_prompt, build_security_prompt, build_user_prompt
from services.llm_providers.base import ReviewPrompt
from services.llm_providers.factory import get_provider, load_custom_providers
from services.result_formatter import parse_llm_output, build_review_result
from services.database import save_review, get_setting
from services.github_client import create_pr_review
from services.email_notifier import send_review_notification
from models.review import FileReview

logger = logging.getLogger(__name__)


async def run_review_pipeline(
    pr_url: str,
    provider_name: str,
    model: str | None,
    *,
    token: str | None = None,
    user_id: int = 0,
    dimensions: list[str] | None = None,
    compare_model: str | None = None,
):
    """异步生成器，逐步产出 SSE 事件 dict

    参数：
        pr_url:        GitHub PR 链接
        provider_name: LLM 提供商名称
        model:         模型名（optional，用 provider 默认值）
        token:         GitHub OAuth Token（可选）
        user_id:       当前用户 ID（用于设置/自定义提供商查询）
        dimensions:    评审维度列表（可选，默认全部）

    产出的事件类型：
        status         — 阶段描述
        progress       — 进度更新 {phase, current, total, message}
        model_info     — {provider, model}
        file_info      — {filename, language, patch}
        token          — LLM 流式输出片段
        file_done      — {file, issues_count, progress}
        review_error   — 错误信息
        done           — 完整 ReviewResult JSON
    """
    # Step 1: 解析 URL
    yield {"event": "status", "data": "正在解析 PR URL..."}
    owner, repo, pull_number = parse_pr_url(pr_url)

    # Step 2: 获取 PR
    yield {"event": "status", "data": f"正在获取 PR 信息: {owner}/{repo}#{pull_number}"}
    pr = await fetch_pr(owner, repo, pull_number, token=token)
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
    await load_custom_providers(user_id)
    max_chars = int(await get_setting(user_id, "chunk_max_chars", "8000"))
    merge_max_chars = int(await get_setting(user_id, "chunk_merge_max_chars", "6000"))
    max_lines = int(await get_setting(user_id, "chunk_max_lines", "2000"))
    strategy = await get_setting(user_id, "chunk_strategy", "auto")

    chunks = await smart_chunk_pr(
        pr, token=token,
        max_chars=max_chars,
        merge_max_chars=merge_max_chars,
        fallback_max_lines=max_lines,
        strategy=strategy,
    )
    yield {"event": "status", "data": f"分片完成，共 {len(chunks)} 个片段待评审"}

    # Step 4: 获取 Provider
    provider = get_provider(provider_name)
    actual_model = model or provider.default_model
    logger.info(f"提供商={provider_name}  模型={actual_model}")
    yield {
        "event": "model_info",
        "data": json.dumps({"provider": provider_name, "model": actual_model}),
    }

    # Step 5: 两阶段逐片段评审（安全审查 → 常规评审）
    file_reviews: list[FileReview] = []
    for idx, fc in enumerate(chunks, start=1):
        yield {
            "event": "file_info",
            "data": json.dumps({
                "filename": fc.filename,
                "language": fc.language,
                "patch": fc.patch or "",
            }),
        }

        user_prompt = build_user_prompt(pr, fc)

        # ── Phase 1: 安全审查 ──
        yield {
            "event": "progress",
            "data": json.dumps({
                "phase": "reviewing_security",
                "current": idx,
                "total": len(chunks),
                "file": fc.filename,
                "language": fc.language,
            }),
        }

        security_issues: list = []
        try:
            sec_prompt = ReviewPrompt(system=build_security_prompt(), user=user_prompt)
            sec_text = ""
            async for token_text in provider.review(sec_prompt, model=model):
                sec_text += token_text
                yield {"event": "token", "data": token_text}
                await asyncio.sleep(0)
            _, security_issues, _ = parse_llm_output(sec_text, fc.filename)
            # 安全检查的 issues 统一标记为 security 类别
            for si in security_issues:
                if si.category not in ("bug", "security", "performance", "style"):
                    si.category = "security"
        except Exception as e:
            msg = str(e).strip() or f"{type(e).__name__}(无详细错误信息)"
            yield {"event": "review_error", "data": f"安全检查失败 [{fc.filename}]: {msg}"}

        # ── Phase 2: 常规评审（Bug/性能/规范）──
        yield {
            "event": "progress",
            "data": json.dumps({
                "phase": "reviewing_normal",
                "current": idx,
                "total": len(chunks),
                "file": fc.filename,
                "language": fc.language,
            }),
        }

        full_text = ""
        try:
            normal_prompt = ReviewPrompt(system=build_system_prompt(dimensions), user=user_prompt)
            async for token_text in provider.review(normal_prompt, model=model):
                full_text += token_text
                yield {"event": "token", "data": token_text}
                await asyncio.sleep(0)
        except Exception as e:
            msg = str(e).strip() or f"{type(e).__name__}(无详细错误信息)"
            yield {"event": "review_error", "data": f"LLM 调用失败 [{fc.filename}]: {msg}"}
            # 安全审查成功但常规失败 — 至少保留安全 issue
            if security_issues:
                file_reviews.append(FileReview(
                    file=fc.filename,
                    summary="(常规评审失败，仅保留安全审查结果)",
                    issues=security_issues,
                    suggestions=[],
                ))
            continue

        try:
            summary, issues, suggestions, scores = parse_llm_output(full_text, fc.filename)
            all_issues = security_issues + list(issues)
            file_reviews.append(FileReview(
                file=fc.filename,
                summary=summary,
                issues=all_issues,
                suggestions=suggestions,
                scores=scores,
            ))
        except Exception as e:
            yield {"event": "review_error", "data": f"解析评审结果失败 [{fc.filename}]: {e}"}
            continue

        yield {
            "event": "file_done",
            "data": json.dumps({
                "file": fc.filename,
                "issues_count": len(all_issues),
                "progress": f"{idx}/{len(chunks)}",
            }),
        }

    # Step 5b: 对比模型评审（可选）
    compare_reviews: list[FileReview] | None = None
    if compare_model:
        compare_reviews = []
        compare_provider = get_provider(provider_name)  # 同提供商、不同模型
        yield {"event": "status", "data": f"对比模型 {compare_model} 开始评审..."}
        for idx, fc in enumerate(chunks, start=1):
            yield {
                "event": "progress",
                "data": json.dumps({
                    "phase": "reviewing_normal",
                    "current": idx,
                    "total": len(chunks),
                    "file": fc.filename,
                    "language": fc.language,
                }),
            }
            try:
                compare_prompt = ReviewPrompt(
                    system=build_system_prompt(dimensions),
                    user=build_user_prompt(pr, fc),
                )
                compare_text = ""
                async for token_text in compare_provider.review(compare_prompt, model=compare_model):
                    compare_text += token_text
                    await asyncio.sleep(0)
                c_summary, c_issues, c_suggestions, c_scores = parse_llm_output(compare_text, fc.filename)
                compare_reviews.append(FileReview(
                    file=fc.filename,
                    summary=c_summary,
                    issues=c_issues,
                    suggestions=c_suggestions,
                    scores=c_scores,
                ))
            except Exception as e:
                logger.warning(f"对比模型评审失败 [{fc.filename}]: {e}")
                continue

    # Step 6: 汇总结果
    result = build_review_result(
        pr_title=pr.title,
        owner=owner, repo=repo, pull_number=pull_number,
        files_changed=len(pr.files),
        additions=pr.additions, deletions=pr.deletions,
        file_reviews=file_reviews,
    )

    # 持久化保存
    try:
        review_id = await save_review(pr_url, provider_name, model, result)
        logger.info(f"评审已保存: ID={review_id} provider={provider_name} model={model}")
    except Exception as e:
        logger.error(f"保存评审记录失败: {e}")

    # 自动同步到 GitHub PR Review
    try:
        auto_sync = await get_setting(user_id, "auto_sync_github", "false")
        if auto_sync == "true" and pr.head_sha:
            gh_comments = []
            for fr in file_reviews:
                for issue in fr.issues:
                    if issue.line:
                        gh_comments.append({
                            "path": issue.file,
                            "line": issue.line,
                            "side": "RIGHT",
                            "body": f"**[{issue.severity.upper()}] {issue.category}** (置信度 {issue.confidence}%)\n\n{issue.description}\n\n> {issue.suggestion}" if issue.suggestion else f"**[{issue.severity.upper()}] {issue.category}**\n\n{issue.description}",
                        })
            if gh_comments:
                review_body = result.summary[:1000] if result.summary else "自动化代码评审完成"
                gh_result = await create_pr_review(
                    owner, repo, pull_number, pr.head_sha, review_body, gh_comments,
                )
                if gh_result:
                    result.github_review_id = gh_result.get("id")
                    logger.info(f"已同步 GitHub PR Review: ID={result.github_review_id}")
    except Exception as e:
        logger.error(f"GitHub PR Review 同步失败: {e}")

    # 邮件通知
    try:
        logger.info(f"正在发送邮件通知: {owner}/{repo}#{pull_number}")
        await send_review_notification(owner, repo, pr.title, result)
        logger.info(f"邮件通知已发送: {owner}/{repo}#{pull_number}")
    except Exception as e:
        logger.error(f"邮件通知失败: {e}")

    # 对比结果
    if compare_reviews is not None:
        compare_result = build_review_result(
            pr_title=pr.title,
            owner=owner, repo=repo, pull_number=pull_number,
            files_changed=len(pr.files),
            additions=pr.additions, deletions=pr.deletions,
            file_reviews=compare_reviews,
        )
        yield {
            "event": "compare_done",
            "data": compare_result.model_dump_json(),
        }

    yield {
        "event": "done",
        "data": result.model_dump_json(),
    }


async def run_review_pipeline_sync(
    pr_url: str,
    provider_name: str,
    model: str | None,
    *,
    token: str | None = None,
    user_id: int = 0,
    dimensions: list[str] | None = None,
):
    """非流式版本 — 消费所有事件，返回 JSON 字符串结果（供调度器等非 SSE 场景使用）"""
    done_data: str | None = None
    async for event in run_review_pipeline(
        pr_url, provider_name, model,
        token=token, user_id=user_id,
        dimensions=dimensions,
    ):
        if event["event"] == "done":
            done_data = event["data"]
    return done_data
