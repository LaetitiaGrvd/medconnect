from flask import Blueprint, jsonify, session

from app.routes.utils import success_response, error_response

reports_bp = Blueprint("reports", __name__)

@reports_bp.get("/api/reports")
def list_reports():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")
    return success_response({"count": 0, "items": []})
