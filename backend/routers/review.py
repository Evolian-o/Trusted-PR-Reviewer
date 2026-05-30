"""评审端点 — SSE 流式评审"""

from fastapi import APIRouter, Query, Depends
from sse_starlette.sse import EventSourceResponse

from services.auth_middleware import optional_auth
from services.auth import AuthInfo
from services.rate_limiter import RateLimiter

router = APIRouter()

_review_limiter = RateLimiter(max_requests=10, window_seconds=60)


async def event_stream(pr_url: str, provider_name: str, model: str | None, dims: str | None, token: str | None = None, user_id: int = 0, compare_model: str | None = None):
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


@router.get("/api/review")
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
