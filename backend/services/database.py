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

        await db.execute("""
            CREATE TABLE IF NOT EXISTS monitored_repos (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL,
                owner       TEXT NOT NULL,
                repo        TEXT NOT NULL,
                active      INTEGER DEFAULT 1,
                last_pr_sha TEXT,
                created_at  TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        await db.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_monitor_user_repo ON monitored_repos(user_id, owner, repo)"
        )

        # 迁移旧表（检测旧 schema 含 smtp_host 则删除重建）
        cursor = await db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='email_config'"
        )
        if await cursor.fetchone():
            cols = await db.execute("PRAGMA table_info(email_config)")
            col_names = [row[1] for row in await cols.fetchall()]
            if "smtp_host" in col_names:
                await db.execute("DROP TABLE email_config")

        await db.execute("""
            CREATE TABLE IF NOT EXISTS email_config (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id  INTEGER NOT NULL UNIQUE,
                to_email TEXT NOT NULL,
                password TEXT NOT NULL,
                enabled  INTEGER DEFAULT 0
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                user_id  INTEGER NOT NULL,
                key      TEXT NOT NULL,
                value    TEXT NOT NULL,
                PRIMARY KEY (user_id, key)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS custom_providers (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         INTEGER NOT NULL,
                name            TEXT NOT NULL,
                display_name    TEXT NOT NULL,
                base_url        TEXT NOT NULL,
                api_key_enc     TEXT NOT NULL,
                default_model   TEXT NOT NULL,
                timeout         INTEGER DEFAULT 120,
                is_enabled      INTEGER DEFAULT 1,
                created_at      TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
                UNIQUE(user_id, name)
            )
        """)

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
                   risk_level, issue_count, suggestion_count, result_json, created_at
                FROM reviews WHERE owner=? AND repo=?
                ORDER BY created_at DESC""",
                (owner, repo),
            )
        elif owner:
            cursor = await db.execute(
                """SELECT id, owner, repo, pull_number, pr_title, pr_url,
                   provider, model, files_changed, additions, deletions,
                   risk_level, issue_count, suggestion_count, result_json, created_at
                FROM reviews WHERE owner=?
                ORDER BY created_at DESC""",
                (owner,),
            )
        else:
            cursor = await db.execute(
                """SELECT id, owner, repo, pull_number, pr_title, pr_url,
                   provider, model, files_changed, additions, deletions,
                   risk_level, issue_count, suggestion_count, result_json, created_at
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


# ── 监控仓库 ──────────────────────────────────────────────

async def add_monitored_repo(user_id: int, owner: str, repo: str) -> int:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "INSERT OR IGNORE INTO monitored_repos (user_id, owner, repo) VALUES (?, ?, ?)",
            (user_id, owner, repo),
        )
        await db.commit()
        return cursor.lastrowid


async def remove_monitored_repo(repo_id: int) -> bool:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute("DELETE FROM monitored_repos WHERE id=?", (repo_id,))
        await db.commit()
        return cursor.rowcount > 0


async def list_monitored_repos(user_id: int) -> list[dict]:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM monitored_repos WHERE user_id=? ORDER BY created_at DESC",
            (user_id,),
        )
        return [dict(row) for row in await cursor.fetchall()]


async def get_monitored_repo_by_name(user_id: int, owner: str, repo: str) -> dict | None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM monitored_repos WHERE user_id=? AND owner=? AND repo=?",
            (user_id, owner, repo),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def update_monitor_sha(repo_id: int, sha: str) -> None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE monitored_repos SET last_pr_sha=? WHERE id=?", (sha, repo_id)
        )
        await db.commit()


async def set_monitor_active(repo_id: int, active: bool) -> None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE monitored_repos SET active=? WHERE id=?", (1 if active else 0, repo_id)
        )
        await db.commit()


async def get_active_monitored_repos(user_id: int) -> list[dict]:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM monitored_repos WHERE user_id=? AND active=1", (user_id,)
        )
        return [dict(row) for row in await cursor.fetchall()]


# ── 邮件配置 ──────────────────────────────────────────────

async def save_email_config(user_id: int, config: dict) -> None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT OR REPLACE INTO email_config
               (user_id, to_email, password, enabled)
               VALUES (?, ?, ?, ?)""",
            (
                user_id, config["to_email"], config.get("password", ""),
                1 if config.get("enabled") else 0,
            ),
        )
        await db.commit()


async def get_email_config(user_id: int) -> dict | None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM email_config WHERE user_id=?", (user_id,)
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


# ── 设置 ──────────────────────────────────────────────────

async def get_all_settings(user_id: int) -> dict:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT key, value FROM settings WHERE user_id=?", (user_id,)
        )
        return {row["key"]: row["value"] for row in await cursor.fetchall()}


async def get_setting(user_id: int, key: str, default: str = "") -> str:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "SELECT value FROM settings WHERE user_id=? AND key=?", (user_id, key)
        )
        row = await cursor.fetchone()
        return row[0] if row else default


async def set_setting(user_id: int, key: str, value: str) -> None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "INSERT OR REPLACE INTO settings (user_id, key, value) VALUES (?, ?, ?)",
            (user_id, key, value),
        )
        await db.commit()


# ── 自定义提供商 ────────────────────────────────────────────

async def list_custom_providers(user_id: int) -> list[dict]:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM custom_providers WHERE user_id=? ORDER BY created_at ASC",
            (user_id,),
        )
        return [dict(row) for row in await cursor.fetchall()]


async def get_custom_provider(user_id: int, name: str) -> dict | None:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM custom_providers WHERE user_id=? AND name=?",
            (user_id, name),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None


async def create_custom_provider(user_id: int, data: dict) -> int:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """INSERT INTO custom_providers
               (user_id, name, display_name, base_url, api_key_enc, default_model, timeout)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                user_id,
                data["name"],
                data["display_name"],
                data["base_url"],
                data["api_key_enc"],
                data.get("default_model", ""),
                data.get("timeout", 120),
            ),
        )
        await db.commit()
        return cursor.lastrowid


async def update_custom_provider(user_id: int, name: str, data: dict) -> bool:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        sets = []
        params = []
        for field in ("display_name", "base_url", "api_key_enc", "default_model",
                       "timeout", "is_enabled"):
            if field in data:
                sets.append(f"{field}=?")
                params.append(data[field])
        if not sets:
            return False
        sets.append("updated_at=datetime('now')")
        params.extend([user_id, name])
        await db.execute(
            f"UPDATE custom_providers SET {', '.join(sets)} WHERE user_id=? AND name=?",
            params,
        )
        await db.commit()
        return True


async def delete_custom_provider(user_id: int, name: str) -> bool:
    await init_db()
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM custom_providers WHERE user_id=? AND name=?",
            (user_id, name),
        )
        await db.commit()
        return cursor.rowcount > 0
