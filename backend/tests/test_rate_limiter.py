"""测试 RateLimiter 频率限制逻辑"""
import time
import pytest
from services.rate_limiter import RateLimiter


class TestRateLimiter:
    def test_allows_requests_within_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        assert limiter.is_allowed("key1") is True
        assert limiter.is_allowed("key1") is True
        assert limiter.is_allowed("key1") is True

    def test_blocks_after_limit(self):
        limiter = RateLimiter(max_requests=3, window_seconds=60)
        for _ in range(3):
            limiter.is_allowed("key1")
        assert limiter.is_allowed("key1") is False

    def test_different_keys_independent(self):
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        for _ in range(2):
            limiter.is_allowed("key1")
        assert limiter.is_allowed("key1") is False
        assert limiter.is_allowed("key2") is True

    def test_remaining_count(self):
        limiter = RateLimiter(max_requests=5, window_seconds=60)
        assert limiter.remaining("key1") == 5
        limiter.is_allowed("key1")
        assert limiter.remaining("key1") == 4
        for _ in range(3):
            limiter.is_allowed("key1")
        assert limiter.remaining("key1") == 1

    def test_window_expires(self, monkeypatch):
        """模拟时间前进，验证窗口过期后重置"""
        limiter = RateLimiter(max_requests=2, window_seconds=60)
        for _ in range(2):
            limiter.is_allowed("key1")
        assert limiter.is_allowed("key1") is False

        # 模拟 61 秒后
        future = time.time() + 61
        monkeypatch.setattr(time, "time", lambda: future)
        assert limiter.is_allowed("key1") is True
