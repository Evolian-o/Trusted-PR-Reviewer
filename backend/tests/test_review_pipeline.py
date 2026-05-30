"""pipeline 集成测试 — 验证 SSE 事件序列"""

import pytest
import json
from unittest.mock import MagicMock, AsyncMock


def _make_mock_provider():
    """构造模拟 LLM provider"""
    provider = MagicMock()

    sec_text = json.dumps({"issues": [], "suggestions": [], "scores": {}})
    normal_text = json.dumps({
        "summary": "looks good",
        "issues": [
            {
                "severity": "medium", "line": 5, "category": "bug",
                "description": "potential None reference",
                "suggestion": "add None check",
                "current_code": "x = y.z",
                "proposed_code": "x = y.z if y else None",
                "confidence": 70, "priority": "should_fix",
            },
        ],
        "suggestions": ["add more tests"],
        "scores": {"overall": 70, "security": 80, "bug": 60, "performance": 75, "style": 80},
    })

    async def mock_review(prompt: list, **kwargs):
        text = sec_text if "安全" in prompt[0].content else normal_text
        yield text

    provider.review = mock_review
    provider.name = "test-provider"
    provider.default_model = "mock-model"
    return provider


def _setup_pipeline_mocks(monkeypatch, sample_pr_info):
    """统一设置 pipeline 所需的全部 mock"""
    import services.review_orchestrator as ro

    monkeypatch.setattr(ro, "parse_pr_url", lambda url: ("test-owner", "test-repo", 1))
    monkeypatch.setattr(ro, "fetch_pr", AsyncMock(return_value=sample_pr_info))
    monkeypatch.setattr(ro, "get_provider", lambda name, user_id=0: _make_mock_provider())
    monkeypatch.setattr(ro, "load_custom_providers", AsyncMock())
    monkeypatch.setattr(ro, "get_setting", AsyncMock(return_value="8000"))
    monkeypatch.setattr(ro, "save_review", AsyncMock(return_value=1))
    monkeypatch.setattr(ro, "create_pr_review", AsyncMock(return_value={"id": 99}))
    monkeypatch.setattr(ro, "send_review_notification", AsyncMock())


@pytest.mark.asyncio
async def test_pipeline_events_sequence(monkeypatch, temp_db, sample_pr_info):
    """验证 SSE 事件序列: status → progress → model_info → done"""
    from services import review_orchestrator

    _setup_pipeline_mocks(monkeypatch, sample_pr_info)

    events = []
    async for event in review_orchestrator.run_review_pipeline(
        pr_url="https://github.com/test-owner/test-repo/pull/1",
        provider_name="test-provider",
        model=None,
    ):
        events.append(event)

    event_types = [e.get("event") for e in events if "event" in e]
    assert "status" in event_types
    assert "progress" in event_types
    assert "model_info" in event_types
    assert "done" in event_types


@pytest.mark.asyncio
async def test_pipeline_done_event_has_result(monkeypatch, temp_db, sample_pr_info):
    """done 事件包含完整的 ReviewResult JSON"""
    from services import review_orchestrator

    _setup_pipeline_mocks(monkeypatch, sample_pr_info)

    done_data = None
    async for event in review_orchestrator.run_review_pipeline(
        pr_url="https://github.com/test-owner/test-repo/pull/1",
        provider_name="test-provider",
        model=None,
    ):
        if event.get("event") == "done":
            done_data = json.loads(event["data"])

    assert done_data is not None
    assert done_data["owner"] == "test-owner"
    assert done_data["repo"] == "test-repo"
    assert done_data["pull_number"] == 1
    assert "scores" in done_data
    assert "risk_level" in done_data


@pytest.mark.asyncio
async def test_pipeline_with_security_dimension(monkeypatch, temp_db, sample_pr_info):
    """只勾选安全维度时，产出只包含安全问题"""
    from services import review_orchestrator

    _setup_pipeline_mocks(monkeypatch, sample_pr_info)

    done_data = None
    async for event in review_orchestrator.run_review_pipeline(
        pr_url="https://github.com/test-owner/test-repo/pull/1",
        provider_name="test-provider",
        model=None,
        dimensions=["security"],
    ):
        if event.get("event") == "done":
            done_data = json.loads(event["data"])

    assert done_data is not None
    for issue in done_data.get("issues", []):
        assert issue["category"] == "security"


@pytest.mark.asyncio
async def test_pipeline_invalid_url():
    """无效 URL 应该在 run_review_pipeline 中 raise ValueError"""
    from services import review_orchestrator

    with pytest.raises(ValueError, match="解析"):
        async for _ in review_orchestrator.run_review_pipeline(
            pr_url="not-a-valid-url",
            provider_name="test-provider",
            model=None,
        ):
            pass
