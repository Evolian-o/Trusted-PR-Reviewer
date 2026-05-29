import json
import aiosqlite

DB_PATH = "reviews.db"


async def init_db():
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS reviews (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                owner           TEXT NOT NULL,
                repo            TEXT NOT NULL,
                pull_number     INTEGER NOT NULL,
                pr_title        TEXT NOT NULL,
                pr_url          TEXT NOT NULL,
                provider        TEXT NOT NULL,
                model           TEXT,
                files_changed   INTEGER DEFAULT 0,
                additions       INTEGER DEFAULT 0,
                deletions       INTEGER DEFAULT 0,
                risk_level      TEXT DEFAULT 'low',
                issue_count     INTEGER DEFAULT 0,
                suggestion_count INTEGER DEFAULT 0,
                result_json     TEXT NOT NULL,
                created_at      TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_reviews_owner_repo ON reviews(owner, repo)"
        )
        await db.commit()


async def save_review(pr_url: str, provider: str, model: str | None, result) -> int:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            INSERT INTO reviews (
                owner, repo, pull_number, pr_title, pr_url,
                provider, model, files_changed, additions, deletions,
                risk_level, issue_count, suggestion_count, result_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                result.owner,
                result.repo,
                result.pull_number,
                result.pr_title,
                pr_url,
                provider,
                model,
                result.files_changed,
                result.additions,
                result.deletions,
                result.risk_level,
                len(result.issues),
                len(result.suggestions),
                result.model_dump_json(),
            ),
        )
        await db.commit()
        return cursor.lastrowid


async def list_reviews(owner: str | None = None, repo: str | None = None) -> list[dict]:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if owner and repo:
            cursor = await db.execute(
                """SELECT id, owner, repo, pull_number, pr_title, pr_url,
                   provider, model, files_changed, additions, deletions,
                   risk_level, issue_count, suggestion_count, created_at
                FROM reviews WHERE owner=? AND repo=?
                ORDER BY created_at DESC""",
                (owner, repo),
            )
        elif owner:
            cursor = await db.execute(
                """SELECT id, owner, repo, pull_number, pr_title, pr_url,
                   provider, model, files_changed, additions, deletions,
                   risk_level, issue_count, suggestion_count, created_at
                FROM reviews WHERE owner=?
                ORDER BY created_at DESC""",
                (owner,),
            )
        else:
            cursor = await db.execute(
                """SELECT id, owner, repo, pull_number, pr_title, pr_url,
                   provider, model, files_changed, additions, deletions,
                   risk_level, issue_count, suggestion_count, created_at
                FROM reviews ORDER BY created_at DESC"""
            )
        return [dict(row) for row in await cursor.fetchall()]


async def get_review(review_id: int) -> dict | None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM reviews WHERE id=?", (review_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def delete_review(review_id: int) -> bool:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM reviews WHERE id=?", (review_id,))
        await db.commit()
        return cursor.rowcount > 0
