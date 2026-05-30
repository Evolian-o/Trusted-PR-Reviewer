import pytest
from services.result_formatter import (
    parse_llm_output, build_review_result,
    determine_risk_level, build_category_summary,
)
from models.review import Issue, FileReview, ReviewResult


class TestParseLlmOutput:
    """测试 LLM 输出的 JSON 解析容错"""

    def test_valid_json_code_block(self):
        text = """```json
{
    "summary": "修复了一个安全问题",
    "issues": [{"severity": "high", "category": "security", "description": "SQL注入风险", "suggestion": "使用参数化查询"}],
    "suggestions": ["添加输入验证"]
}
```"""
        summary, issues, suggestions, _scores = parse_llm_output(text, "test.py")
        assert "修复" in summary
        assert len(issues) == 1
        assert issues[0].severity == "high"
        assert issues[0].category == "security"
        assert issues[0].file == "test.py"
        assert len(suggestions) == 1

    def test_bare_json(self):
        text = """{"summary":"ok","issues":[],"suggestions":[]}"""
        summary, issues, suggestions, _scores = parse_llm_output(text, "x.py")
        assert summary == "ok"
        assert issues == []
        assert suggestions == []

    def test_json_with_think_prefix(self):
        """LLM 在 JSON 前后加了思考文本"""
        text = """好的，我来分析这个文件。
{"summary": "没有问题", "issues": [], "suggestions": []}
以上就是我的评审。"""
        summary, issues, suggestions, _scores = parse_llm_output(text, "a.py")
        assert "没有问题" == summary

    def test_completely_garbled(self):
        """完全无法解析的文本，fallback 提取"""
        text = """这个代码看起来还行
1. 建议加注释
2. 变量名可以更清晰
- 考虑添加单元测试
"""
        summary, issues, suggestions, _scores = parse_llm_output(text, "f.py")
        assert summary == text[:300].strip()
        assert issues == []
        # 应该能提取建议
        assert len(suggestions) > 0

    def test_empty_string(self):
        summary, issues, suggestions, _scores = parse_llm_output("", "e.py")
        assert "返回为空" in summary
        assert issues == []

    def test_empty_whitespace(self):
        summary, issues, suggestions, _scores = parse_llm_output("   \n  ", "e.py")
        assert "返回为空" in summary


class TestNormalizeIssues:
    """测试 issue 标准化"""

    def test_invalid_severity_gets_medium(self):
        text = """{"summary":"x","issues":[{"severity":"INVALID","category":"bug","description":"x","suggestion":"y"}],"suggestions":[]}"""
        _, issues, _, _scores = parse_llm_output(text, "test.py")
        assert issues[0].severity == "medium"

    def test_invalid_category_gets_style(self):
        text = """{"summary":"x","issues":[{"severity":"low","category":"WRONG","description":"x","suggestion":"y"}],"suggestions":[]}"""
        _, issues, _, _scores = parse_llm_output(text, "test.py")
        assert issues[0].category == "style"

    def test_missing_fields_get_defaults(self):
        text = """{"summary":"x","issues":[{}],"suggestions":[]}"""
        _, issues, _, _scores = parse_llm_output(text, "test.py")
        assert issues[0].severity == "medium"
        assert issues[0].description == ""


class TestDetermineRiskLevel:
    def test_empty_issues_low(self):
        assert determine_risk_level([]) == "low"

    def test_critical_gives_high(self):
        issues = [Issue(severity="critical", file="x", line=1, category="security",
                        description="", suggestion="", current_code="", proposed_code="",
                        confidence=90, priority="must_fix")]
        assert determine_risk_level(issues) == "high"

    def test_high_gives_medium(self):
        issues = [Issue(severity="high", file="x", line=1, category="bug",
                        description="", suggestion="", current_code="", proposed_code="",
                        confidence=70, priority="should_fix")]
        assert determine_risk_level(issues) == "medium"

    def test_only_low_returns_low(self):
        issues = [
            Issue(severity="low", file="x", line=1, category="style",
                  description="", suggestion="", current_code="", proposed_code="",
                  confidence=30, priority="nice_to_fix"),
            Issue(severity="medium", file="y", line=2, category="performance",
                  description="", suggestion="", current_code="", proposed_code="",
                  confidence=50, priority="should_fix"),
        ]
        assert determine_risk_level(issues) == "low"


class TestBuildCategorySummary:
    def test_empty_issues(self):
        text = build_category_summary([], [])
        assert "未发现问题" in text

    def test_groups_by_category(self):
        issues = [
            Issue(severity="high", file="a.py", line=1, category="security",
                  description="SQL 注入", suggestion="参数化", current_code="", proposed_code="",
                  confidence=90, priority="must_fix"),
            Issue(severity="medium", file="b.py", line=2, category="bug",
                  description="空指针", suggestion="检查 null", current_code="", proposed_code="",
                  confidence=70, priority="should_fix"),
        ]
        text = build_category_summary(issues, [])
        assert "安全漏洞" in text
        assert "逻辑缺陷" in text

    def test_includes_suggestions(self):
        issues = [Issue(severity="low", file="x.py", line=1, category="style",
                        description="命名", suggestion="改名", current_code="", proposed_code="",
                        confidence=40, priority="nice_to_fix")]
        text = build_category_summary(issues, ["统一编码风格"])
        assert "统一编码风格" in text


class TestBuildReviewResult:
    def test_aggregates_issues_from_all_files(self):
        fr1 = FileReview(file="a.py", summary="ok", issues=[
            Issue(severity="high", file="a.py", line=1, category="bug",
                  description="", suggestion="", current_code="", proposed_code="",
                  confidence=80, priority="must_fix"),
        ], suggestions=[], scores={"overall": 70, "security": 80, "bug": 50, "performance": 80, "style": 80})
        fr2 = FileReview(file="b.py", summary="ok", issues=[
            Issue(severity="medium", file="b.py", line=2, category="style",
                  description="", suggestion="", current_code="", proposed_code="",
                  confidence=50, priority="nice_to_fix"),
        ], suggestions=["add tests"], scores={"overall": 90, "security": 90, "bug": 90, "performance": 90, "style": 90})
        result = build_review_result(
            pr_title="Test PR", owner="owner", repo="repo", pull_number=1,
            files_changed=2, additions=10, deletions=5, file_reviews=[fr1, fr2])
        assert len(result.issues) == 2
        assert "add tests" in result.suggestions

    def test_scores_averaged(self):
        fr1 = FileReview(file="a.py", summary="", issues=[], suggestions=[],
                         scores={"overall": 60, "security": 70, "bug": 50, "performance": 60, "style": 60})
        fr2 = FileReview(file="b.py", summary="", issues=[], suggestions=[],
                         scores={"overall": 80, "security": 90, "bug": 70, "performance": 80, "style": 80})
        result = build_review_result(
            pr_title="PR", owner="o", repo="r", pull_number=1,
            files_changed=2, additions=0, deletions=0, file_reviews=[fr1, fr2])
        assert result.scores["overall"] == 70  # (60+80)/2
        assert result.scores["security"] == 80  # (70+90)/2

    def test_risk_level_high_with_critical(self):
        fr = FileReview(file="a.py", summary="", issues=[
            Issue(severity="critical", file="a.py", line=1, category="security",
                  description="", suggestion="", current_code="", proposed_code="",
                  confidence=95, priority="must_fix"),
        ], suggestions=[], scores={"overall": 0, "security": 0, "bug": 0, "performance": 0, "style": 0})
        result = build_review_result(
            pr_title="PR", owner="o", repo="r", pull_number=1,
            files_changed=1, additions=0, deletions=0, file_reviews=[fr])
        assert result.risk_level == "high"

    def test_header_contains_counts(self):
        result = build_review_result(
            pr_title="Test", owner="o", repo="r", pull_number=1,
            files_changed=1, additions=10, deletions=3, file_reviews=[])
        assert "10" in result.summary
        assert "3" in result.summary
        assert "0 个问题" in result.summary
