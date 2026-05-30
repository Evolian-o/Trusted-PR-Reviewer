"""简单的内存 IP 频率限制，保护 LLM 评审端点不被误刷"""
import time
from collections import defaultdict


class RateLimiter:
    def __init__(self, max_requests: int = 10, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _prune(self, key: str, now: float) -> None:
        cutoff = now - self.window
        self._hits[key] = [t for t in self._hits[key] if t > cutoff]
        if not self._hits[key]:
            del self._hits[key]

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        self._prune(key, now)
        if len(self._hits[key]) >= self.max_requests:
            return False
        self._hits[key].append(now)
        return True

    def remaining(self, key: str) -> int:
        self._prune(key, time.time())
        return max(0, self.max_requests - len(self._hits[key]))
