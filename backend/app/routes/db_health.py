from flask import Blueprint, jsonify
from app.db import get_connection
from app.routes.utils import success_response

db_health_bp = Blueprint("db_health", __name__)


@db_health_bp.get("/api/db-health")
def db_health():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 AS ok;")
            row = cur.fetchone()
    return success_response({"ok": True, "db": row})
