from pydantic import BaseModel


class FileChange(BaseModel):
    filename: str
    status: str  # added | modified | removed | renamed
    patch: str = ""
    additions: int = 0
    deletions: int = 0
    language: str = ""
    context_hint: str = ""  # 分片上下文：如 "class UserService — 方法 create_user()"


class PRInfo(BaseModel):
    owner: str
    repo: str
    pull_number: int
    title: str = ""
    description: str = ""
    files: list[FileChange] = []
    additions: int = 0
    deletions: int = 0
    head_sha: str = ""  # PR head commit SHA，用于获取完整文件内容


class Issue(BaseModel):
    severity: str  # critical | high | medium | low
    file: str
    line: int | None = None
    category: str  # bug | security | performance | style
    description: str
    suggestion: str = ""
    # 1.2: 建议具体化 — LLM 输出 current/proposed 代码对比
    current_code: str = ""   # 当前有问题的代码片段
    proposed_code: str = ""  # 建议修改后的代码片段
    # 1.3: 置信度 + 优先级
    confidence: int = 0   # LLM 自评置信度 0-100
    priority: str = "should_fix"  # must_fix | should_fix | nice_to_fix


class FileReview(BaseModel):
    file: str
    summary: str = ""
    issues: list[Issue] = []
    suggestions: list[str] = []


class ReviewResult(BaseModel):
    owner: str
    repo: str
    pull_number: int
    pr_title: str = ""
    files_changed: int = 0
    additions: int = 0
    deletions: int = 0
    risk_level: str = "low"
    summary: str = ""
    file_reviews: list[FileReview] = []
    issues: list[Issue] = []
    suggestions: list[str] = []
    # 3.1: 量化评分
    scores: dict = {}  # { overall, security, bug, performance, style } 0-100
    # 4.1: 分享
    share_token: str = ""
    # 4.3: GitHub PR Review 回写
    github_review_id: int | None = None
