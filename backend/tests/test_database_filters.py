"""测试 list_reviews 筛选条件（使用临时文件隔离）"""
import os
import tempfile
import aiosqlite
import pytest
import services.database as db_mod


@pytest.fixture(autouse=True)
def temp_db(monkeypatch):
    """为每个测试创建独立临时数据库"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setattr(db_mod, "DB_PATH", path)
    yield
    try:
        os.unlink(path)
    except OSError:
        pass


async def _seed():
    """初始化并插入测试数据"""
    await db_mod.init_db()
    async with aiosqlite.connect(db_mod.DB_PATH) as db:
        for owner, repo, title in [
            ("alice", "backend", "fix: SQL injection in login"),
            ("bob", "frontend", "feat: add dark mode"),
            ("carol", "backend", "refactor: extract auth module"),
        ]:
            await db.execute(
                """INSERT INTO reviews (owner, repo, pull_number, pr_title, pr_url,
                   provider, model, result_json, created_at)
                   VALUES (?, ?, 1, ?, 'https://example.com',
                   'deepseek', 'deepseek-chat', '{}', datetime('now', 'localtime'))""",
                (owner, repo, title),
            )
        await db.commit()


@pytest.mark.asyncio
async def test_list_all():
    await _seed()
    rows = await db_mod.list_reviews()
    assert len(rows) == 3


@pytest.mark.asyncio
async def test_keyword_matches_owner():
    await _seed()
    rows = await db_mod.list_reviews(keyword="alice")
    assert len(rows) == 1
    assert rows[0]["owner"] == "alice"


@pytest.mark.asyncio
async def test_keyword_matches_title():
    await _seed()
    rows = await db_mod.list_reviews(keyword="dark")
    assert len(rows) == 1
    assert "dark" in rows[0]["pr_title"]


@pytest.mark.asyncio
async def test_keyword_no_match():
    await _seed()
    rows = await db_mod.list_reviews(keyword="nonexistentxyz123")
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_from_date_filters():
    await _seed()
    rows = await db_mod.list_reviews(from_date="2020-01-01")
    assert len(rows) == 3


@pytest.mark.asyncio
async def test_to_date_filters():
    await _seed()
    rows = await db_mod.list_reviews(to_date="2000-01-01")
    assert len(rows) == 0


@pytest.mark.asyncio
async def test_combined_filters():
    await _seed()
    rows = await db_mod.list_reviews(keyword="backend", from_date="2020-01-01")
    assert len(rows) == 2
    owners = {r["owner"] for r in rows}
    assert owners == {"alice", "carol"}
