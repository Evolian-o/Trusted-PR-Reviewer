from models.review import PRInfo, FileChange

SYSTEM_PROMPT = """你是一名资深代码评审专家。审查以下 Pull Request 中的单个文件变更。

## 评审维度
1. **Bug 风险** — 空指针、边界条件、异常处理、逻辑错误
2. **安全漏洞** — 注入攻击、敏感信息泄露、权限绕过
3. **性能问题** — N+1 查询、内存泄漏、不必要循环
4. **代码规范** — 命名、可读性、SOLID 原则

## 输出格式
必须返回合法的 JSON，不要包含 markdown 代码块标记：
{
  "summary": "一句话总结这个文件的变更目的",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "line": 42,
      "category": "bug|security|performance|style",
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ],
  "suggestions": ["整体优化建议"]
}
如果没有发现问题，issues 返回空数组 []。"""

MAX_DIFF_CHARS = 8000


def build_user_prompt(pr: PRInfo, fc: FileChange) -> str:
    diff = fc.patch or ""
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n... (diff 已截断)"

    parts = [
        f"## PR 信息",
        f"标题: {pr.title}",
    ]
    if pr.description:
        parts.append(f"描述: {pr.description[:500]}")

    parts += [
        f"",
        f"## 当前文件",
        f"文件名: {fc.filename}",
        f"状态: {fc.status}",
        f"语言: {fc.language}",
    ]

    if fc.context_hint:
        parts.append(f"分片上下文: {fc.context_hint}")

    parts += [
        f"",
        f"## 变更内容 (完整函数/方法/类上下文)",
        f"```{fc.language.lower() if fc.language else ''}",
        f"{diff}",
        f"```",
    ]

    return "\n".join(parts)
