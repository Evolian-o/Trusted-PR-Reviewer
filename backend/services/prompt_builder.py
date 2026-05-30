from models.review import PRInfo, FileChange

_ALL_DIMENSIONS = {
    "bug": "Bug 风险 — 空指针、边界条件、异常处理、逻辑错误",
    "security": "安全漏洞 — 注入攻击、敏感信息泄露、权限绕过",
    "performance": "性能问题 — N+1 查询、内存泄漏、不必要循环",
    "style": "代码规范 — 命名、可读性、SOLID 原则",
}

_OUTPUT_FORMAT = """## 输出格式
必须返回合法的 JSON，不要包含 markdown 代码块标记：
{
  "summary": "一句话总结这个文件的变更目的",
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "line": 42,
      "category": "bug|security|performance|style",
      "description": "问题描述（明确指出问题所在）",
      "suggestion": "修改建议的一句话概括",
      "current_code": "当前有问题的代码片段（原样摘录，不超过5行）",
      "proposed_code": "修改后的代码片段（展示最佳实践写法）",
      "confidence": 85,
      "priority": "must_fix|should_fix|nice_to_fix"
    }
  ],
  "suggestions": ["整体优化建议（不超过3条）"]
}
**重要约束**：
- confidence 必须是 0-100 的整数，≥80=非常确定，50-79=合理推测，<50=不确定（宁可漏报不要误报）
- priority: must_fix=必须修复（安全漏洞/逻辑错误）, should_fix=应当修复（重大性能/规范问题）, nice_to_fix=可选优化
- current_code 和 proposed_code 必须是从变更中摘录的真实代码片段，不能是虚构的
- 每个 issue 的 suggestion 说明"为什么不好"和"怎样改"，proposed_code 展示改动后的效果
- 如果没有发现问题，issues 返回空数组 []。"""


def build_system_prompt(dimensions: list[str] | None = None) -> str:
    dims = [d for d in (dimensions or list(_ALL_DIMENSIONS.keys())) if d in _ALL_DIMENSIONS]
    if not dims:
        dims = list(_ALL_DIMENSIONS.keys())
    items = "\n".join(
        f"{i+1}. **{_ALL_DIMENSIONS[d]}**"
        for i, d in enumerate(dims)
    )
    return f"""你是一名资深代码评审专家。审查以下 Pull Request 中的单个文件变更。

## 评审维度
{items}

{_OUTPUT_FORMAT}"""


_SECURITY_PROMPT = """你是一名资深应用安全专家。你的唯一任务是审查以下代码变更中的**安全漏洞**。

## 你必须检查的安全风险
1. **注入攻击**: SQL/NoSQL/OS 命令/代码注入（参数化查询、escape、白名单校验）
2. **XSS/输出编码**: 未转义的用户输入渲染到 HTML/JS
3. **敏感信息泄露**: 日志/错误消息中打印密码/token/密钥、响应中暴露内部路径
4. **权限绕过**: 缺少身份验证/授权检查、越权访问（IDOR）
5. **不安全的数据存储**: 明文存储密码、硬编码密钥、不安全加密算法
6. **SSRF/URL 跳转**: 用户可控的 URL 请求未校验白名单
7. **文件操作**: 路径遍历、任意文件上传/读取
8. **依赖安全**: 使用了已知有漏洞的库/版本

## 输出格式
必须返回合法的 JSON，不要包含 markdown 代码块标记：
{
  "issues": [
    {
      "severity": "critical|high|medium|low",
      "line": 42,
      "description": "安全问题描述",
      "suggestion": "修复建议",
      "current_code": "当前有漏洞的代码",
      "proposed_code": "安全修复后的代码",
      "confidence": 85,
      "priority": "must_fix"
    }
  ]
}
**没有发现问题时 issues 返回 []**。不要报告非安全问题（如代码规范、性能优化）。"""


SYSTEM_PROMPT = build_system_prompt()


def build_security_prompt() -> str:
    return _SECURITY_PROMPT

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
