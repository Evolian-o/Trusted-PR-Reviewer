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
    import os
    ext = os.path.splitext(filename)[1].lower()
    return LANGUAGE_MAP.get(ext, "")


async def fetch_pr(owner: str, repo: str, pull_number: int, token: str | None = None) -> PRInfo:
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with aiohttp.ClientSession(headers=headers) as session:
        pr_url = f"{GITHUB_API}/repos/{owner}/{repo}/pulls/{pull_number}"
        async with session.get(pr_url) as resp:
            if resp.status == 404:
                raise ValueError(f"PR 不存在: {owner}/{repo}#{pull_number}")
            if resp.status == 403:
                raise RuntimeError("GitHub API 限流，请稍后重试或提供 Token")
            resp.raise_for_status()
            pr_data = await resp.json()

        files_url = f"{pr_url}/files"
        async with session.get(files_url, params={"per_page": 100}) as resp:
            resp.raise_for_status()
            files_data = await resp.json()

    files = []
    for f in files_data:
        files.append(FileChange(
            filename=f["filename"],
            status=f["status"],
            patch=f.get("patch", ""),
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
    )
