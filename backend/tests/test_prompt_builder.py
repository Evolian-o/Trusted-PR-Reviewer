"""prompt_builder 测试"""

from services.prompt_builder import (
    build_system_prompt, build_security_prompt, build_user_prompt,
    SYSTEM_PROMPT, MAX_DIFF_CHARS,
)
from models.review import FileChange, PRInfo


class TestBuildSystemPrompt:
    def test_default_all_dimensions(self):
        """默认包含全部 4 个维度"""
        prompt = build_system_prompt()
        assert "Bug 风险" in prompt
        assert "安全漏洞" in prompt
        assert "性能问题" in prompt
        assert "代码规范" in prompt

    def test_specified_dimensions(self):
        """指定维度只包含选中的"""
        prompt = build_system_prompt(["security", "bug"])
        assert "安全漏洞" in prompt
        assert "Bug 风险" in prompt
        assert "性能问题" not in prompt
        assert "代码规范" not in prompt

    def test_empty_dimensions_fallback(self):
        """空列表 fallback 到全部维度"""
        prompt = build_system_prompt([])
        assert "Bug 风险" in prompt

    def test_invalid_dimensions_ignored(self):
        """非法维度被忽略"""
        prompt = build_system_prompt(["security", "invalid"])
        assert "安全漏洞" in prompt
        assert "invalid" not in prompt

    def test_output_format_present(self):
        """提示词包含 JSON 输出格式说明"""
        prompt = build_system_prompt()
        assert "JSON" in prompt.lower() or "json" in prompt.lower()
        assert "summary" in prompt


class TestBuildSecurityPrompt:
    def test_security_prompt_focus(self):
        """安全 prompt 只关注安全问题"""
        prompt = build_security_prompt()
        assert "安全" in prompt
        assert "注入攻击" in prompt or "注入" in prompt

    def test_security_prompt_excludes_non_security(self):
        """安全 prompt 明确要求不要报告非安全问题"""
        prompt = build_security_prompt()
        assert "非安全" in prompt

    def test_security_output_format(self):
        """安全 prompt 定义了自己的输出格式"""
        prompt = build_security_prompt()
        assert "issues" in prompt


class TestBuildUserPrompt:
    def test_basic_user_prompt(self, sample_pr_info, sample_file_change):
        prompt = build_user_prompt(sample_pr_info, sample_file_change)
        assert "Test PR" in prompt
        assert "main.py" in prompt
        assert "new_function" in prompt or "modified" in prompt

    def test_diff_truncation(self, sample_pr_info):
        """超长 diff 被截断"""
        long_patch = "x" * (MAX_DIFF_CHARS + 100)
        fc = FileChange(filename="big.py", status="modified", language="python", patch=long_patch)
        prompt = build_user_prompt(sample_pr_info, fc)
        assert "截断" in prompt

    def test_no_description(self, sample_file_change):
        """PR 无描述的情况"""
        pr = PRInfo(
            owner="t", repo="r", pull_number=1, title="No desc",
            description="", files=[sample_file_change],
            additions=1, deletions=0, head_sha="b",
        )
        prompt = build_user_prompt(pr, sample_file_change)
        assert "No desc" in prompt
