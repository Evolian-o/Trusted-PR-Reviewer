"""评审历史 & 分享端点"""

import json
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from services.auth_middleware import require_auth
from services.auth import AuthInfo
from services.database import (
    list_reviews, get_review, delete_review,
    get_repo_stats, get_review_by_share_token,
)

router = APIRouter()


@router.get("/api/history")
async def history(
    keyword: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    auth: AuthInfo = Depends(require_auth),
):
    rows = await list_reviews(keyword=keyword, from_date=from_date, to_date=to_date, user_id=auth.user_id)
    return {"reviews": rows}


# stats 必须在 {review_id} 之前定义，避免路径匹配冲突
@router.get("/api/history/stats")
async def history_stats(owner: str, repo: str):
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
        try:
            data = json.loads(row["result_json"])
            entry["scores"] = data.get("scores", {})
        except (json.JSONDecodeError, TypeError):
            entry["scores"] = {}
        trend.append(entry)
    return {"trend": trend}


@router.get("/api/history/{review_id}")
async def history_detail(review_id: int):
    row = await get_review(review_id)
    if not row:
        return {"error": "记录不存在"}, 404
    return row


@router.delete("/api/history/{review_id}")
async def history_delete(review_id: int):
    deleted = await delete_review(review_id)
    if not deleted:
        return {"error": "记录不存在"}, 404
    return {"status": "ok"}


@router.get("/api/share/{token}")
async def shared_review(token: str):
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
