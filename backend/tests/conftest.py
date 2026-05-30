"""共享测试 fixtures"""

import pytest
import tempfile
import os

from models.review import PRInfo, FileChange


@pytest.fixture
def sample_file_change() -> FileChange:
    """含真实 diff 片段的 sample FileChange"""
    return FileChange(
        filename="main.py",
        status="modified",
        language="python",
        additions=5,
        deletions=2,
        patch="@@ -1,3 +1,6 @@\n+def new_function():\n+    return True\n+\n def existing():\n     pass\n",
    )


@pytest.fixture
def sample_pr_info(sample_file_change) -> PRInfo:
    """含 2 个 FileChange 的 sample PRInfo"""
    return PRInfo(
        owner="test-owner",
        repo="test-repo",
        pull_number=1,
        title="Test PR: add new_function",
        description="A test pull request",
        files=[sample_file_change],
        additions=5,
        deletions=2,
        base_sha="abc123",
        head_sha="def456",
    )


@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    """用临时 SQLite 数据库替代生产数据库"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    import services.database as db_mod
    monkeypatch.setattr(db_mod, "DB_PATH", path)
    # 重新初始化数据库
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    loop.run_until_complete(db_mod.init_db())
    yield
    try:
        os.unlink(path)
    except OSError:
        pass
