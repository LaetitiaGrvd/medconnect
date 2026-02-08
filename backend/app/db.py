import os
import psycopg
from psycopg.rows import dict_row
from pathlib import Path


def _db_url():
    url = os.getenv("DATABASE_URL") or os.getenv("database_url")
    if not url or not str(url).strip():
        raise RuntimeError("DATABASE_URL is not set")
    return url.strip()


def get_connection():
    return psycopg.connect(_db_url(), row_factory=dict_row)


def apply_migrations():
    migrations_dir = Path(__file__).resolve().parents[1] / "migrations"
    if not migrations_dir.exists():
        raise RuntimeError(f"Migrations directory not found: {migrations_dir}")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS schema_migrations (
                    version TEXT PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
            """)

            cur.execute("SELECT version FROM schema_migrations;")
            applied = {row.get("version") for row in cur.fetchall() or []}

            for path in sorted(migrations_dir.glob("*.sql")):
                version = path.name
                if version in applied:
                    continue

                sql_text = path.read_text(encoding="utf-8")
                statements = [s.strip() for s in sql_text.split(";") if s.strip()]
                for statement in statements:
                    cur.execute(statement)

                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s);",
                    (version,),
                )
        conn.commit()


def init_db():
    apply_migrations()
