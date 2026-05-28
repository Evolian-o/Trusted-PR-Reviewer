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


def parse_llm_output(text: str, filename: str) -> tuple[str, list[Issue], list[str]]:
    """从 LLM 原始输出中提取 summary / issues / suggestions"""
    # 尝试 JSON 解析
    data = None
    # 先找 ```json ... ``` 代码块
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if m:
        try:
            data = json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 再尝试直接整个文本解析
    if data is None:
        try:
            data = json.loads(text.strip())
        except json.JSONDecodeError:
            pass

    if data is None:
        # fallback：把全文当 summary
        return (text[:200], [], [])

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

    return ReviewResult(
        owner=owner,
        repo=repo,
        pull_number=pull_number,
        pr_title=pr_title,
        files_changed=files_changed,
        additions=additions,
        deletions=deletions,
        risk_level=determine_risk_level(all_issues),
        summary=f"共审查 {len(file_reviews)} 个文件，发现 {len(all_issues)} 个问题。",
        file_reviews=file_reviews,
        issues=all_issues,
        suggestions=all_suggestions,
    )
