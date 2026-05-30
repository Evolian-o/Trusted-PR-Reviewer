"""健康检查 + 统计端点"""

from fastapi import APIRouter

from services.result_formatter import get_extraction_stats

router = APIRouter()


@router.get("/api/health")
async def health():
    return {"status": "ok", "extraction_stats": get_extraction_stats()}
