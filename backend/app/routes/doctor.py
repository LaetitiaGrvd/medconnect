import datetime
import json
import time
import uuid
from pathlib import Path
from flask import Blueprint, jsonify, request, session

from app.db import get_connection
from sms import send_sms


doctor_bp = Blueprint("doctor", __name__)

ALLOWED_STATUS = {"booked", "confirmed", "cancelled", "completed"}
ALLOWED_AVATAR_MIME = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
}
MAX_AVATAR_SIZE = 2 * 1024 * 1024
AVATARS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "avatars"


def _error(status: int, code: str, message: str):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def _require_doctor():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return _error(401, "unauthorized", "Unauthorized")
    if role != "doctor":
        return _error(403, "forbidden", "Forbidden")
    return None


def _doctor_scope_id():
    raw = session.get("doctor_id")
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _ensure_avatars_dir():
    AVATARS_DIR.mkdir(parents=True, exist_ok=True)


def _avatar_ext_from_mime(mime: str):
    return ALLOWED_AVATAR_MIME.get((mime or "").strip().lower())


def _avatar_filename(doctor_id: int, ext: str) -> str:
    stamp = int(time.time())
    token = uuid.uuid4().hex[:8]
    return f"doctor_{doctor_id}_{stamp}_{token}.{ext}"


def _delete_avatar_file(avatar_url: str):
    if not avatar_url:
        return
    if not avatar_url.startswith("/uploads/avatars/"):
        return
    filename = Path(avatar_url).name
    if not filename:
        return
    path = AVATARS_DIR / filename
    if path.exists() and path.is_file():
        try:
            path.unlink()
        except Exception:
            pass


def _serialize_appt(row: dict):
    if not row:
        return None
    data = dict(row)
    data.setdefault("patient_name", row.get("name"))
    data.setdefault("patient_email", row.get("email"))
    data.setdefault("patient_phone", row.get("phone"))
    data.setdefault("doctor_name", row.get("doctor"))
    return data


def _parse_list_field(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(v).strip() for v in raw if str(v).strip()]
    if isinstance(raw, str):
        val = raw.strip()
        if not val:
            return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(v).strip() for v in parsed if str(v).strip()]
    except Exception:
        pass
    if isinstance(raw, str):
        return [raw.strip()]
    return []


def _normalize_list_input(value):
    if value is None:
        return None
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    raw = str(value)
    if not raw.strip():
        return []
    return [line.strip() for line in raw.splitlines() if line.strip()]


def _log_notify(appointment_id: int, doctor_id: int, template_key: str, sent: bool, error: str = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO doctor_notify_logs
                    (appointment_id, doctor_id, template_key, sent, error)
                VALUES
                    (%s, %s, %s, %s, %s)
                """,
                (appointment_id, doctor_id, template_key, sent, error),
            )
        conn.commit()


@doctor_bp.get("/api/doctor/appointments")
def list_doctor_appointments():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    range_key = (request.args.get("range") or "all").strip().lower()

    today = datetime.date.today()
    today_iso = today.isoformat()
    week_end = (today + datetime.timedelta(days=6)).isoformat()

    sql = "SELECT * FROM appointments WHERE doctor_id = %s"
    params = [doctor_id]

    if range_key == "today":
        sql += " AND date = %s"
        params.append(today_iso)
    elif range_key == "week":
        sql += " AND date >= %s AND date <= %s"
        params.extend([today_iso, week_end])
    elif range_key == "all":
        pass
    else:
        return _error(400, "validation_error", "range must be today, week, or all")

    sql += " ORDER BY date ASC, time ASC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    items = [_serialize_appt(r) for r in (rows or [])]
    return jsonify({"success": True, "data": {"count": len(items), "items": items}}), 200


@doctor_bp.get("/api/doctor/summary")
def doctor_summary():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    today = datetime.date.today().isoformat()
    week_end = (datetime.date.today() + datetime.timedelta(days=6)).isoformat()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = %s", (doctor_id,))
            total = cur.fetchone().get("count", 0)

            cur.execute(
                "SELECT COUNT(*) AS count FROM appointments WHERE doctor_id = %s AND date = %s",
                (doctor_id, today),
            )
            today_count = cur.fetchone().get("count", 0)

            cur.execute(
                """
                SELECT COUNT(*) AS count
                FROM appointments
                WHERE doctor_id = %s AND date >= %s AND date <= %s
                """,
                (doctor_id, today, week_end),
            )
            week_count = cur.fetchone().get("count", 0)

            cur.execute(
                """
                SELECT status, COUNT(*) AS count
                FROM appointments
                WHERE doctor_id = %s
                GROUP BY status
                """,
                (doctor_id,),
            )
            status_rows = cur.fetchall()

    by_status = {str(r.get("status") or "").strip().lower(): r.get("count", 0) for r in status_rows or []}

    return jsonify({
        "success": True,
        "data": {
            "doctor_id": doctor_id,
            "total": total,
            "today": today_count,
            "week": week_count,
            "by_status": by_status,
        },
    }), 200


@doctor_bp.get("/api/doctor/profile")
def doctor_profile():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM doctors WHERE id = %s LIMIT 1", (doctor_id,))
            row = cur.fetchone()

    if not row:
        return _error(404, "not_found", "Doctor not found")

    return jsonify({
        "success": True,
        "data": {
            "id": row.get("id"),
            "full_name": row.get("full_name"),
            "specialty": row.get("specialty"),
            "bio": row.get("bio") or "",
            "experience": _parse_list_field(row.get("experience")),
            "certifications": _parse_list_field(row.get("certifications")),
            "specialisations": _parse_list_field(row.get("specialisations")),
        },
    }), 200


@doctor_bp.patch("/api/doctor/profile")
def doctor_update_profile():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    payload = request.get_json(silent=True) or {}

    updates = {}
    if "bio" in payload:
        bio = str(payload.get("bio") or "").strip()
        updates["bio"] = bio or None

    if "experience" in payload:
        items = _normalize_list_input(payload.get("experience"))
        updates["experience"] = json.dumps(items) if items else None

    if "certifications" in payload:
        items = _normalize_list_input(payload.get("certifications"))
        updates["certifications"] = json.dumps(items) if items else None

    if "specialisations" in payload:
        items = _normalize_list_input(payload.get("specialisations"))
        updates["specialisations"] = json.dumps(items) if items else None

    if not updates:
        return _error(400, "validation_error", "No fields to update")

    fields = []
    values = []
    for key, value in updates.items():
        fields.append(f"{key} = %s")
        values.append(value)
    fields.append("updated_at = NOW()")
    values.append(doctor_id)

    sql = "UPDATE doctors SET " + ", ".join(fields) + " WHERE id = %s RETURNING *;"

    updated = None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(values))
            updated = cur.fetchone()
        conn.commit()

    if not updated:
        return _error(404, "not_found", "Doctor not found")

    return jsonify({
        "success": True,
        "data": {
            "id": updated.get("id"),
            "full_name": updated.get("full_name"),
            "specialty": updated.get("specialty"),
            "bio": updated.get("bio") or "",
            "experience": _parse_list_field(updated.get("experience")),
            "certifications": _parse_list_field(updated.get("certifications")),
            "specialisations": _parse_list_field(updated.get("specialisations")),
        },
    }), 200


@doctor_bp.patch("/api/doctor/appointments/<int:appt_id>/status")
def doctor_update_status(appt_id: int):
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    payload = request.get_json(silent=True) or {}
    new_status = str(payload.get("status") or "").strip().lower()

    if not new_status or new_status not in ALLOWED_STATUS:
        return _error(400, "validation_error", "Invalid status")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM appointments WHERE id = %s AND doctor_id = %s LIMIT 1",
                (appt_id, doctor_id),
            )
            appt = cur.fetchone()

    if not appt:
        return _error(404, "not_found", "Appointment not found")

    old_status = str(appt.get("status") or "").strip().lower()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE appointments SET status = %s WHERE id = %s RETURNING *;",
                (new_status, appt_id),
            )
            updated = cur.fetchone()
        conn.commit()

    sms_result = {"ok": False, "error": "not_sent"}
    try:
        if new_status != old_status:
            sms_text = (
                f"MedConnect: Your appointment with {updated.get('doctor','your doctor')} "
                f"on {updated.get('date','')} at {updated.get('time','')} is now {new_status}."
            )
            sms_result = send_sms(updated.get("phone", ""), sms_text)
    except Exception as e:
        sms_result = {"ok": False, "error": str(e)}

    return jsonify({
        "success": True,
        "data": {
            "appointment": _serialize_appt(updated),
            "sms": {
                "sent": bool(sms_result.get("ok")),
                "sid": sms_result.get("sid"),
                "error": sms_result.get("error") if not sms_result.get("ok") else None,
            },
        },
    }), 200


@doctor_bp.post("/api/doctor/appointments/<int:appt_id>/notify")
def doctor_notify_patient(appt_id: int):
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    payload = request.get_json(silent=True) or {}
    template_key = str(payload.get("template_key") or "").strip().lower()
    custom_message = str(payload.get("custom_message") or "").strip()

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM appointments WHERE id = %s AND doctor_id = %s LIMIT 1",
                (appt_id, doctor_id),
            )
            appt = cur.fetchone()

    if not appt:
        return _error(404, "not_found", "Appointment not found")

    if template_key not in ("reminder", "change", "custom"):
        return _error(400, "validation_error", "Invalid template_key")

    doctor_name = appt.get("doctor") or "your doctor"
    date = appt.get("date") or ""
    time = appt.get("time") or ""

    if template_key == "reminder":
        message = f"MedConnect: Reminder of your appointment with {doctor_name} on {date} at {time}."
    elif template_key == "change":
        message = (
            f"MedConnect: Please check your appointment details with {doctor_name} "
            f"on {date} at {time}. There may be updates."
        )
    else:
        if not custom_message:
            return _error(400, "validation_error", "custom_message is required for custom template")
        message = custom_message

    phone = str(appt.get("phone") or "").strip()
    if not phone:
        _log_notify(appt_id, doctor_id, template_key, False, "Missing patient phone")
        return _error(400, "validation_error", "Patient phone number is missing")

    sms_result = send_sms(phone, message)
    sent = bool(sms_result.get("ok"))
    err = sms_result.get("error") if not sent else None

    _log_notify(appt_id, doctor_id, template_key, sent, err)

    return jsonify({
        "success": True,
        "data": {
            "sent": sent,
            "sid": sms_result.get("sid"),
            "error": err,
        },
    }), 200


@doctor_bp.post("/api/doctor/avatar")
def doctor_upload_avatar():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    file = request.files.get("avatar")
    if not file or not file.filename:
        return _error(400, "validation_error", "avatar file is required")

    ext = _avatar_ext_from_mime(file.mimetype or "")
    if not ext:
        return _error(400, "validation_error", "Invalid file type. Use JPG, PNG, or WEBP.")

    data = file.read()
    if not data:
        return _error(400, "validation_error", "avatar file is empty")
    if len(data) > MAX_AVATAR_SIZE:
        return _error(400, "validation_error", "avatar file must be 2MB or smaller")

    _ensure_avatars_dir()
    filename = _avatar_filename(doctor_id, ext)
    file_path = AVATARS_DIR / filename

    try:
        with open(file_path, "wb") as f:
            f.write(data)
    except Exception:
        return _error(500, "server_error", "Unable to save avatar")

    avatar_url = f"/uploads/avatars/{filename}"
    previous_url = None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT avatar_url FROM doctors WHERE id = %s LIMIT 1", (doctor_id,))
            row = cur.fetchone()
            if not row:
                try:
                    file_path.unlink()
                except Exception:
                    pass
                return _error(404, "not_found", "Doctor not found")

            previous_url = row.get("avatar_url")
            cur.execute(
                """
                UPDATE doctors
                SET avatar_url = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING avatar_url
                """,
                (avatar_url, doctor_id),
            )
            updated = cur.fetchone()
        conn.commit()

    if previous_url and previous_url != avatar_url:
        _delete_avatar_file(previous_url)

    return jsonify({"success": True, "data": {"avatar_url": updated.get("avatar_url")}}), 200


@doctor_bp.delete("/api/doctor/avatar")
def doctor_delete_avatar():
    guard = _require_doctor()
    if guard:
        return guard

    doctor_id = _doctor_scope_id()
    if doctor_id is None:
        return _error(403, "forbidden", "Forbidden")

    previous_url = None

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT avatar_url FROM doctors WHERE id = %s LIMIT 1", (doctor_id,))
            row = cur.fetchone()
            if not row:
                return _error(404, "not_found", "Doctor not found")

            previous_url = row.get("avatar_url")
            cur.execute(
                """
                UPDATE doctors
                SET avatar_url = NULL, updated_at = NOW()
                WHERE id = %s
                RETURNING avatar_url
                """,
                (doctor_id,),
            )
            cur.fetchone()
        conn.commit()

    if previous_url:
        _delete_avatar_file(previous_url)

    return jsonify({"success": True, "data": {}}), 200
