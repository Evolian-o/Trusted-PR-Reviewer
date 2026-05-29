import os
import re
import aiohttp
from models.review import PRInfo, FileChange

GITHUB_API = "https://api.github.com"
LANGUAGE_MAP = {
    ".py": "Python", ".js": "JavaScript", ".ts": "TypeScript",
    ".tsx": "TypeScript/React", ".jsx": "JavaScript/React",
    ".go": "Go", ".rs": "Rust", ".java": "Java", ".rb": "Ruby",
    ".c": "C", ".cpp": "C++", ".h": "C/C++ Header",
    ".css": "CSS", ".html": "HTML", ".json": "JSON",
    ".yaml": "YAML", ".yml": "YAML", ".md": "Markdown",
    ".sql": "SQL", ".sh": "Shell", ".toml": "TOML",
}


def parse_pr_url(url: str) -> tuple[str, str, int]:
    """从 GitHub PR URL 提取 owner, repo, pull_number"""
    pattern = r"github\.com/([^/]+)/([^/]+)/pull/(\d+)"
    m = re.search(pattern, url)
    if not m:
        raise ValueError(f"无法解析 PR URL: {url}")
    return m.group(1), m.group(2).removesuffix(".git"), int(m.group(3))


def detect_language(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return LANGUAGE_MAP.get(ext, "")


async def fetch_pr(owner: str, repo: str, pull_number: int, token: str | None = None) -> PRInfo:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    timeout = aiohttp.ClientTimeout(total=30)
    async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
        pr_url = f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pull_number}"
        async with session.get(pr_url) as resp:
            if resp.status == 404:
                raise ValueError(f"PR 不存在: {owner}/{repo}#{pull_number}")
            if resp.status == 403:
                remaining = resp.headers.get("X-RateLimit-Remaining")
                if remaining is not None and int(remaining) == 0:
                    raise RuntimeError("GitHub API 限流，请稍后重试或提供 Token")
                raise RuntimeError("GitHub API 访问被拒绝 (403)，请检查仓库权限或 Token 有效性")
            resp.raise_for_status()
            pr_data = await resp.json()

        # 分页获取所有文件（GitHub 每页最多返回 100 个文件）
        files_data = []
        page_url = f"{pr_url}/files?per_page=100"
        while page_url:
            async with session.get(page_url) as resp:
                resp.raise_for_status()
                files_data.extend(await resp.json())
                # 解析 Link 响应头获取下一页 URL
                link = resp.headers.get("Link", "")
                page_url = None
                if 'rel="next"' in link:
                    for part in link.split(","):
                        if 'rel="next"' in part:
                            page_url = part.split(";")[0].strip(" <>")
                            break

    files = []
    for f in files_data:
        files.append(FileChange(
            filename=f["filename"],
            status=f["status"],
            patch=f.get("patch") or "",
            additions=f["additions"],
            deletions=f["deletions"],
            language=detect_language(f["filename"]),
        ))

    return PRInfo(
        owner=owner,
        repo=repo,
        pull_number=pull_number,
        title=pr_data.get("title", ""),
        description=(pr_data.get("body") or ""),
        files=files,
        additions=pr_data.get("additions", 0),
        deletions=pr_data.get("deletions", 0),
        head_sha=pr_data.get("head", {}).get("sha", ""),
    )
