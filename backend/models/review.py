from pydantic import BaseModel


class FileChange(BaseModel):
    filename: str
    status: str  # added | modified | removed | renamed
    patch: str = ""
    additions: int = 0
    deletions: int = 0
    language: str = ""


class PRInfo(BaseModel):
    owner: str
    repo: str
    pull_number: int
    title: str = ""
    description: str = ""
    files: list[FileChange] = []
    additions: int = 0
    deletions: int = 0


class Issue(BaseModel):
    severity: str  # critical | high | medium | low
    file: str
    line: int | None = None
    category: str  # bug | security | performance | style
    description: str
    suggestion: str = ""


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
