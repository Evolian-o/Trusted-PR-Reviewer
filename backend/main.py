import json
import asyncio

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from services.github_adapter import parse_pr_url, fetch_pr
from services.diff_parser import chunk_pr
from services.prompt_builder import SYSTEM_PROMPT, build_user_prompt
from services.llm_providers.base import ReviewPrompt
from services.llm_providers.factory import get_provider
from services.result_formatter import parse_llm_output, build_review_result
from models.review import FileReview

app = FastAPI(title="Trusted PR Reviewer")

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


async def event_stream(pr_url: str, provider_name: str, model: str | None):
    """SSE 事件流生成器：拉 PR → 分片 → LLM 逐文件评审 → 推送结果"""
    try:
        # Step 1: 解析 URL
        yield {"event": "status", "data": "正在解析 PR URL..."}
        owner, repo, pull_number = parse_pr_url(pr_url)

        # Step 2: 获取 PR
        yield {"event": "status", "data": f"正在获取 PR 信息: {owner}/{repo}#{pull_number}"}
        pr = await fetch_pr(owner, repo, pull_number)
        yield {
            "event": "progress",
            "data": json.dumps({
                "phase": "fetching",
                "current": 0,
                "total": len(pr.files),
                "message": f"已获取 {len(pr.files)} 个文件",
            }),
        }

        # Step 3: 按文件分片
        chunks = chunk_pr(pr)
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
            async for token in provider.review(prompt, model=model):
                full_text += token
                yield {"event": "token", "data": token}
                await asyncio.sleep(0)

            summary, issues, suggestions = parse_llm_output(full_text, fc.filename)
            file_reviews.append(FileReview(
                file=fc.filename,
                summary=summary,
                issues=issues,
                suggestions=suggestions,
            ))

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

    except ValueError as e:
        yield {"event": "error", "data": str(e)}
    except RuntimeError as e:
        yield {"event": "error", "data": str(e)}
    except Exception as e:
        yield {"event": "error", "data": f"未知错误: {str(e)}"}


@app.get("/api/review")
async def review(
    url: str = Query(..., description="GitHub PR URL"),
    provider: str = Query("ollama", description="LLM Provider"),
    model: str | None = Query(None, description="模型名称"),
):
    return EventSourceResponse(event_stream(url, provider, model))
