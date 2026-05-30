import pytest
from services.result_formatter import parse_llm_output


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
        summary, issues, suggestions = parse_llm_output(text, "test.py")
        assert "修复" in summary
        assert len(issues) == 1
        assert issues[0].severity == "high"
        assert issues[0].category == "security"
        assert issues[0].file == "test.py"
        assert len(suggestions) == 1

    def test_bare_json(self):
        text = """{"summary":"ok","issues":[],"suggestions":[]}"""
        summary, issues, suggestions = parse_llm_output(text, "x.py")
        assert summary == "ok"
        assert issues == []
        assert suggestions == []

    def test_json_with_think_prefix(self):
        """LLM 在 JSON 前后加了思考文本"""
        text = """好的，我来分析这个文件。
{"summary": "没有问题", "issues": [], "suggestions": []}
以上就是我的评审。"""
        summary, issues, suggestions = parse_llm_output(text, "a.py")
        assert "没有问题" == summary

    def test_completely_garbled(self):
        """完全无法解析的文本，fallback 提取"""
        text = """这个代码看起来还行
1. 建议加注释
2. 变量名可以更清晰
- 考虑添加单元测试
"""
        summary, issues, suggestions = parse_llm_output(text, "f.py")
        assert summary == text[:300].strip()
        assert issues == []
        # 应该能提取建议
        assert len(suggestions) > 0

    def test_empty_string(self):
        summary, issues, suggestions = parse_llm_output("", "e.py")
        assert "返回为空" in summary
        assert issues == []

    def test_empty_whitespace(self):
        summary, issues, suggestions = parse_llm_output("   \n  ", "e.py")
        assert "返回为空" in summary


class TestNormalizeIssues:
    """测试 issue 标准化"""

    def test_invalid_severity_gets_medium(self):
        text = """{"summary":"x","issues":[{"severity":"INVALID","category":"bug","description":"x","suggestion":"y"}],"suggestions":[]}"""
        _, issues, _ = parse_llm_output(text, "test.py")
        assert issues[0].severity == "medium"

    def test_invalid_category_gets_style(self):
        text = """{"summary":"x","issues":[{"severity":"low","category":"WRONG","description":"x","suggestion":"y"}],"suggestions":[]}"""
        _, issues, _ = parse_llm_output(text, "test.py")
        assert issues[0].category == "style"

    def test_missing_fields_get_defaults(self):
        text = """{"summary":"x","issues":[{}],"suggestions":[]}"""
        _, issues, _ = parse_llm_output(text, "test.py")
        assert issues[0].severity == "medium"
        assert issues[0].description == ""
