# backend/availability.py
import json
from flask import Blueprint, jsonify, request

from app.db import get_connection
from app.routes.utils import success_response, error_response

availability_bp = Blueprint("availability", __name__)

# In-memory storage (Phase 2 simple mode)
# Key: doctor_id (int or str), Value: weekly schedule dict
DOCTOR_AVAILABILITY = {}

# Simple default schedule (used if a doctor has none yet)
DEFAULT_WEEKLY_SCHEDULE = {
    "mon": ["09:00-12:00", "13:00-16:00"],
    "tue": ["09:00-12:00", "13:00-16:00"],
    "wed": ["09:00-12:00"],
    "thu": ["09:00-12:00", "13:00-16:00"],
    "fri": ["09:00-12:00"],
    "sat": [],
    "sun": [],
}

DAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
VALID_DAYS = set(DAY_ORDER)


def _is_valid_window(s: str) -> bool:
    # Expected format: "HH:MM-HH:MM"
    if not isinstance(s, str) or "-" not in s:
        return False
    start, end = s.split("-", 1)
    if len(start) != 5 or len(end) != 5:
        return False
    # naive validation; good enough for uni project
    return start[2] == ":" and end[2] == ":"


def _validate_schedule(data: dict):
    if not isinstance(data, dict):
        return "Schedule must be an object."

    unknown = set(data.keys()) - VALID_DAYS
    if unknown:
        return f"Unknown day keys: {sorted(list(unknown))}"

    for day in VALID_DAYS:
        windows = data.get(day, [])
        if windows is None:
            windows = []
        if not isinstance(windows, list):
            return f"'{day}' must be an array."
        for w in windows:
            if not _is_valid_window(w):
                return f"Invalid time window '{w}' in '{day}'. Use 'HH:MM-HH:MM'."

    return None


@availability_bp.get("/api/doctors/<doctor_id>/availability")
def get_availability(doctor_id):
    schedule = DOCTOR_AVAILABILITY.get(str(doctor_id))
    if schedule is None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT availability_days, availability_start, availability_end
                    FROM doctors
                    WHERE id = %s
                    LIMIT 1
                    """,
                    (doctor_id,),
                )
                row = cur.fetchone()

        if not row:
            return error_response(404, "not_found", "Doctor not found")

        raw_days = row.get("availability_days")
        days = []
        if isinstance(raw_days, list):
            days = [str(d).strip().lower() for d in raw_days if str(d).strip()]
        else:
            try:
                parsed = json.loads(raw_days or "[]")
                if isinstance(parsed, list):
                    days = [str(d).strip().lower() for d in parsed if str(d).strip()]
            except Exception:
                days = []

        start = row.get("availability_start")
        end = row.get("availability_end")
        start_str = start.strftime("%H:%M") if hasattr(start, "strftime") else str(start or "")[:5]
        end_str = end.strftime("%H:%M") if hasattr(end, "strftime") else str(end or "")[:5]

        window = f"{start_str}-{end_str}" if start_str and end_str else None
        schedule = {}
        for day in DAY_ORDER:
            schedule[day] = [window] if window and day in days else []

    return success_response({"doctor_id": str(doctor_id), "weekly": schedule})


@availability_bp.put("/api/doctors/<doctor_id>/availability")
def put_availability(doctor_id):
    data = request.get_json(silent=True) or {}
    weekly = data.get("weekly")

    err = _validate_schedule(weekly)
    if err:
        return error_response(400, "validation_error", err)

    DOCTOR_AVAILABILITY[str(doctor_id)] = weekly
    return success_response({"doctor_id": str(doctor_id), "weekly": weekly})
