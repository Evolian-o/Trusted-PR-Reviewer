import json
import re

from models.review import Issue, FileReview, ReviewResult


VALID_SEVERITIES = {"critical", "high", "medium", "low"}
VALID_CATEGORIES = {"bug", "security", "performance", "style"}


def _sanitize_severity(raw: str) -> str:
    raw = raw.lower().strip()
    return raw if raw in VALID_SEVERITIES else "medium"


def _sanitize_category(raw: str) -> str:
    raw = raw.lower().strip()
    return raw if raw in VALID_CATEGORIES else "style"


def _extract_json_from_text(text: str) -> dict | None:
    """从文本中提取 JSON 对象（处理 LLM 输出不规范的情况）"""
    cleaned = text.strip()

    # 1. 尝试 ```json ... ``` 代码块
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", cleaned, re.IGNORECASE)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 2. 尝试直接解析全文
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # 3. 用大括号匹配提取第一个完整 JSON 对象
    #    处理 LLM 在 JSON 前后加"思考"文本的情况
    start = cleaned.find("{")
    if start != -1:
        depth = 0
        in_string = False
        escape = False
        for i in range(start, len(cleaned)):
            ch = cleaned[i]
            if escape:
                escape = False
                continue
            if ch == "\\":
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = cleaned[start:i + 1]
                    try:
                        return json.loads(candidate)
                    except json.JSONDecodeError:
                        break  # 括号匹配但 JSON 不合法，放弃
    return None


def _extract_suggestions_from_text(text: str) -> list[str]:
    """从非 JSON 文本中尝试提取建议"""
    suggestions = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # 匹配编号列表：1. xxx / - xxx / * xxx
        m = re.match(r"^(?:\d+[\.\)]\s*|[-*]\s+)(.+)$", line)
        if m:
            suggestions.append(m.group(1).strip())
    return suggestions[:5]  # 最多 5 条


def parse_llm_output(text: str, filename: str) -> tuple[str, list[Issue], list[str]]:
    """从 LLM 原始输出中提取 summary / issues / suggestions"""
    if not text or not text.strip():
        return ("LLM 返回为空", [], [])

    data = _extract_json_from_text(text)

    if data is None:
        # 完全无法解析 JSON，尝试从文本中提取有用信息
        suggestions = _extract_suggestions_from_text(text)
        return (text[:300].strip(), [], suggestions)

    summary = data.get("summary", "") or ""
    raw_issues = data.get("issues", []) or []
    suggestions = data.get("suggestions", []) or []

    issues = _normalize_issues(raw_issues, filename)
    return summary, issues, suggestions


def _normalize_issues(raw_data: list[dict], filename: str) -> list[Issue]:
    issues = []
    for item in raw_data or []:
        if not isinstance(item, dict):
            continue
        issues.append(Issue(
            severity=_sanitize_severity(item.get("severity", "medium")),
            file=filename,
            line=item.get("line"),
            category=_sanitize_category(item.get("category", "style")),
            description=str(item.get("description", "")),
            suggestion=str(item.get("suggestion", "")),
        ))
    return issues


def determine_risk_level(issues: list[Issue]) -> str:
    severities = {i.severity for i in issues}
    if "critical" in severities:
        return "high"
    if "high" in severities:
        return "medium"
    if issues:
        return "low"
    return "low"


CATEGORY_LABELS = {
    "security": "安全漏洞",
    "bug": "逻辑缺陷",
    "performance": "性能问题",
    "style": "代码风格",
}

CATEGORY_ICONS = {
    "security": "🔒",
    "bug": "🐛",
    "performance": "⚡",
    "style": "🎨",
}

RISK_LABELS = {"high": "高风险", "medium": "中风险", "low": "低风险"}


def build_category_summary(issues: list[Issue], suggestions: list[str]) -> str:
    """按风险类别分组生成易读的评审总结"""
    if not issues:
        return "未发现问题，代码质量良好。"

    # 按类别分组
    groups: dict[str, list[Issue]] = {}
    for issue in issues:
        groups.setdefault(issue.category, []).append(issue)

    # 类别排序：security → bug → performance → style
    cat_order = ["security", "bug", "performance", "style"]
    sorted_cats = [c for c in cat_order if c in groups]

    lines: list[str] = []
    for cat in sorted_cats:
        items = groups[cat]
        label = CATEGORY_LABELS.get(cat, cat)
        icon = CATEGORY_ICONS.get(cat, "")
        lines.append(f"\n{icon} {label}（{len(items)}个）")

        # 严重程度排序
        sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        items.sort(key=lambda i: sev_order.get(i.severity, 9))

        for item in items:
            sev_tag = f"[{item.severity.upper()}]"
            loc = f"{item.file}" + (f":{item.line}" if item.line else "")
            lines.append(f"  {sev_tag} {loc}")
            lines.append(f"      {item.description}")
            if item.suggestion:
                lines.append(f"      → {item.suggestion}")

    # 总体建议
    if suggestions:
        lines.append(f"\n━━ 整改优先级 ━━")
        # 去重取前 5 条
        seen = set()
        unique = []
        for s in suggestions:
            if s not in seen:
                seen.add(s)
                unique.append(s)
        for i, s in enumerate(unique[:5], 1):
            lines.append(f"  {i}. {s}")

    return "\n".join(lines)


def build_review_result(
    pr_title: str,
    owner: str,
    repo: str,
    pull_number: int,
    files_changed: int,
    additions: int,
    deletions: int,
    file_reviews: list[FileReview],
) -> ReviewResult:
    all_issues: list[Issue] = []
    all_suggestions: list[str] = []
    for fr in file_reviews:
        all_issues.extend(fr.issues)
        all_suggestions.extend(fr.suggestions)

    risk_level = determine_risk_level(all_issues)
    category_text = build_category_summary(all_issues, all_suggestions)

    # 头部概览
    risk_cn = RISK_LABELS.get(risk_level, risk_level)
    header = (
        f"审查 {len(file_reviews)} 个文件，+{additions}/-{deletions}，"
        f"发现 {len(all_issues)} 个问题，风险等级：{risk_cn}"
    )

    return ReviewResult(
        owner=owner,
        repo=repo,
        pull_number=pull_number,
        pr_title=pr_title,
        files_changed=files_changed,
        additions=additions,
        deletions=deletions,
        risk_level=risk_level,
        summary=header + "\n" + category_text,
        file_reviews=file_reviews,
        issues=all_issues,
        suggestions=all_suggestions,
    )
