import json
import secrets
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash

from app.db import get_connection
from app.routes.utils import success_response
from app.email_utils import send_email

doctors_bp = Blueprint("doctors", __name__)

VALID_DAYS = {"mon", "tue", "wed", "thu", "fri", "sat", "sun"}


def _error(status: int, code: str, message: str):
    return jsonify({"success": False, "error": {"code": code, "message": message}}), status


def _require_admin():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return _error(401, "unauthorized", "Unauthorized")
    if role != "admin":
        return _error(403, "forbidden", "Forbidden")
    return None


def _norm_email(email: str) -> str:
    return (email or "").strip().lower()


def _generate_temp_password(length: int = 10) -> str:
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _format_time(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        try:
            return value.strftime("%H:%M")
        except Exception:
            pass
    raw = str(value).strip()
    if len(raw) >= 5:
        return raw[:5]
    return raw


def _format_dt(value):
    if value is None:
        return None
    if hasattr(value, "isoformat"):
        try:
            return value.isoformat()
        except Exception:
            pass
    return str(value)


def _time_to_minutes(value):
    if value is None:
        return None
    if hasattr(value, "strftime"):
        try:
            return value.hour * 60 + value.minute
        except Exception:
            pass
    raw = str(value).strip()
    if not raw:
        return None
    parts = raw.split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
    except ValueError:
        return None
    if h < 0 or h > 23 or m < 0 or m > 59:
        return None
    return h * 60 + m


def _parse_time_field(value, field: str, required: bool):
    if value is None:
        if required:
            return None, None, f"{field} is required"
        return None, None, None
    raw = str(value).strip()
    if not raw:
        if required:
            return None, None, f"{field} is required"
        return None, None, None
    parts = raw.split(":")
    if len(parts) < 2:
        return None, None, f"{field} must be in HH:MM format"
    try:
        h = int(parts[0])
        m = int(parts[1])
        s = int(parts[2]) if len(parts) > 2 else 0
    except ValueError:
        return None, None, f"{field} must be in HH:MM format"
    if h < 0 or h > 23 or m < 0 or m > 59 or s < 0 or s > 59:
        return None, None, f"{field} must be a valid time"
    if m != 0 or s != 0:
        return None, None, f"{field} must be on the hour for 1-hour slots"
    normalized = f"{h:02d}:{m:02d}"
    return h * 60 + m, normalized, None


def _parse_days(value, required: bool):
    if value is None:
        if required:
            return None, "availability_days is required"
        return None, None
    if not isinstance(value, list):
        return None, "availability_days must be an array of day keys"
    normalized = []
    seen = set()
    for item in value:
        day = str(item or "").strip().lower()
        if not day:
            continue
        if day not in VALID_DAYS:
            return None, f"Invalid availability_days value: '{day}'"
        if day not in seen:
            normalized.append(day)
            seen.add(day)
    return normalized, None


def _coerce_bool(value, field: str):
    if isinstance(value, bool):
        return value, None
    if value is None:
        return None, None
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("true", "1", "yes"):
            return True, None
        if v in ("false", "0", "no"):
            return False, None
    return None, f"{field} must be a boolean"


def _parse_days_from_row(raw):
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(d).strip().lower() for d in raw if str(d).strip()]
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(d).strip().lower() for d in parsed if str(d).strip()]
    except Exception:
        pass
    return []


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


def _serialize_doctor(row: dict, public: bool = False):
    if not row:
        return None
    days = _parse_days_from_row(row.get("availability_days"))
    data = {
        "id": row.get("id"),
        "full_name": row.get("full_name"),
        "specialty": row.get("specialty"),
        "avatar_url": row.get("avatar_url"),
        "availability_days": days,
        "availability_start": _format_time(row.get("availability_start")),
        "availability_end": _format_time(row.get("availability_end")),
        "bio": row.get("bio"),
        "experience": _parse_list_field(row.get("experience")),
        "certifications": _parse_list_field(row.get("certifications")),
        "specialisations": _parse_list_field(row.get("specialisations")),
    }
    if public:
        return data
    data.update({
        "email": row.get("email"),
        "phone": row.get("phone"),
        "is_active": bool(row.get("is_active")),
        "created_at": _format_dt(row.get("created_at")),
        "updated_at": _format_dt(row.get("updated_at")),
    })
    return data


def _fetch_doctor_row(doctor_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM doctors WHERE id = %s LIMIT 1", (doctor_id,))
            return cur.fetchone()


@doctors_bp.route("/api/doctors", methods=["GET"])
def list_doctors():
    specialty = request.args.get("specialty")
    available = request.args.get("available")
    active = (request.args.get("active") or "").strip().lower()

    sql = "SELECT * FROM doctors WHERE is_active = TRUE"
    params = []

    if specialty:
        sql += " AND LOWER(specialty) = %s"
        params.append(str(specialty).strip().lower())

    if available is not None and str(available).strip().lower() == "false":
        return success_response({"count": 0, "items": []})

    if active in ("1", "true", "yes"):
        sql = """
            SELECT id, full_name, specialty
            FROM doctors
            WHERE is_active = TRUE
            ORDER BY full_name ASC
        """
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(sql)
                rows = cur.fetchall()

        return jsonify([
            {
                "id": r.get("id"),
                "full_name": r.get("full_name"),
                "specialty": r.get("specialty"),
            }
            for r in rows or []
        ]), 200

    sql += " ORDER BY id ASC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    items = [_serialize_doctor(r, public=True) for r in (rows or [])]
    return success_response({"count": len(items), "items": items})


@doctors_bp.get("/api/doctors/<int:doctor_id>")
def get_doctor_public(doctor_id: int):
    row = _fetch_doctor_row(doctor_id)
    if not row or not row.get("is_active"):
        return _error(404, "not_found", "Doctor not found")
    return success_response(_serialize_doctor(row, public=True))


@doctors_bp.route("/api/admin/doctors", methods=["GET"])
def admin_list_doctors():
    guard = _require_admin()
    if guard:
        return guard

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM doctors ORDER BY id ASC")
            rows = cur.fetchall()

    items = [_serialize_doctor(r) for r in (rows or [])]
    return jsonify({"success": True, "data": items}), 200


@doctors_bp.route("/api/admin/doctors/<int:doctor_id>", methods=["GET"])
def admin_get_doctor(doctor_id: int):
    guard = _require_admin()
    if guard:
        return guard

    row = _fetch_doctor_row(doctor_id)
    if not row:
        return _error(404, "not_found", "Doctor not found")

    return jsonify({"success": True, "data": _serialize_doctor(row)}), 200


@doctors_bp.route("/api/admin/doctors", methods=["POST"])
def admin_create_doctor():
    guard = _require_admin()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}

    full_name = str(payload.get("full_name") or "").strip()
    email = _norm_email(payload.get("email"))
    specialty = str(payload.get("specialty") or "").strip()
    phone = str(payload.get("phone") or "").strip() or None

    days, days_err = _parse_days(payload.get("availability_days"), required=True)
    start_min, start_norm, start_err = _parse_time_field(payload.get("availability_start"), "availability_start", True)
    end_min, end_norm, end_err = _parse_time_field(payload.get("availability_end"), "availability_end", True)
    is_active, active_err = _coerce_bool(payload.get("is_active"), "is_active")

    if not full_name:
        return _error(400, "validation_error", "full_name is required")
    if not email:
        return _error(400, "validation_error", "email is required")
    if not specialty:
        return _error(400, "validation_error", "specialty is required")
    if days_err:
        return _error(400, "validation_error", days_err)
    if start_err:
        return _error(400, "validation_error", start_err)
    if end_err:
        return _error(400, "validation_error", end_err)
    if active_err:
        return _error(400, "validation_error", active_err)

    if start_min is None or end_min is None:
        return _error(400, "validation_error", "availability_start and availability_end are required")
    if start_min >= end_min:
        return _error(400, "validation_error", "availability_start must be before availability_end")
    if (end_min - start_min) < 60 or (end_min - start_min) % 60 != 0:
        return _error(400, "validation_error", "availability window must align to 1-hour slots")

    temp_password = _generate_temp_password()
    pwd_hash = generate_password_hash(temp_password)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM doctors WHERE LOWER(email) = %s LIMIT 1", (email,))
            if cur.fetchone():
                return _error(409, "conflict", "email must be unique")

            cur.execute("SELECT 1 FROM users WHERE LOWER(email) = %s LIMIT 1", (email,))
            if cur.fetchone():
                return _error(409, "conflict", "user with email already exists")

            cur.execute(
                """
                INSERT INTO doctors
                    (full_name, email, specialty, phone, is_active,
                     availability_days, availability_start, availability_end)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *;
                """,
                (
                    full_name,
                    email,
                    specialty,
                    phone,
                    True if is_active is None else is_active,
                    json.dumps(days),
                    start_norm,
                    end_norm,
                ),
            )
            row = cur.fetchone()

            cur.execute(
                """
                INSERT INTO users (email, password_hash, name, phone, role, doctor_id)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    email,
                    pwd_hash,
                    full_name,
                    phone,
                    "doctor",
                    row.get("id"),
                ),
            )
        conn.commit()

    try:
        email_body = "\n".join([
            f"Hello Dr {full_name},",
            "",
            "Your MedConnect account has been created.",
            f"Email/Username: {email}",
            f"Temporary password: {temp_password}",
            "",
            "Please log in and change your password after your first login.",
        ])
        send_email(email, "Your MedConnect account", email_body)
    except Exception:
        pass

    return jsonify({
        "success": True,
        "data": {
            "doctor": _serialize_doctor(row),
            "temp_password": temp_password,
        },
    }), 201


@doctors_bp.route("/api/admin/doctors/<int:doctor_id>", methods=["PATCH"])
def admin_update_doctor(doctor_id: int):
    guard = _require_admin()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    row = _fetch_doctor_row(doctor_id)
    if not row:
        return _error(404, "not_found", "Doctor not found")

    updates = {}
    full_name = payload.get("full_name")
    email = payload.get("email")
    specialty = payload.get("specialty")
    phone = payload.get("phone")
    is_active = payload.get("is_active")

    if full_name is not None:
        name = str(full_name).strip()
        if not name:
            return _error(400, "validation_error", "full_name cannot be empty")
        updates["full_name"] = name

    if email is not None:
        norm = _norm_email(email)
        if not norm:
            return _error(400, "validation_error", "email cannot be empty")
        updates["email"] = norm

    if specialty is not None:
        spec = str(specialty).strip()
        if not spec:
            return _error(400, "validation_error", "specialty cannot be empty")
        updates["specialty"] = spec

    if phone is not None:
        updates["phone"] = str(phone).strip() or None

    if is_active is not None:
        active, active_err = _coerce_bool(is_active, "is_active")
        if active_err:
            return _error(400, "validation_error", active_err)
        updates["is_active"] = active

    if "availability_days" in payload:
        days, err = _parse_days(payload.get("availability_days"), required=False)
        if err:
            return _error(400, "validation_error", err)
        if days is not None:
            updates["availability_days"] = json.dumps(days)

    start_min, start_norm, start_err = _parse_time_field(
        payload.get("availability_start"), "availability_start", False
    )
    end_min, end_norm, end_err = _parse_time_field(
        payload.get("availability_end"), "availability_end", False
    )
    if start_err:
        return _error(400, "validation_error", start_err)
    if end_err:
        return _error(400, "validation_error", end_err)

    existing_start_min = _time_to_minutes(row.get("availability_start"))
    existing_end_min = _time_to_minutes(row.get("availability_end"))

    if start_min is not None:
        updates["availability_start"] = start_norm
    else:
        start_min = existing_start_min

    if end_min is not None:
        updates["availability_end"] = end_norm
    else:
        end_min = existing_end_min

    if start_min is not None and end_min is not None:
        if start_min >= end_min:
            return _error(400, "validation_error", "availability_start must be before availability_end")
        if (end_min - start_min) < 60 or (end_min - start_min) % 60 != 0:
            return _error(400, "validation_error", "availability window must align to 1-hour slots")

    if not updates:
        return _error(400, "validation_error", "No fields to update")

    if "email" in updates and updates["email"] != _norm_email(row.get("email")):
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM doctors WHERE LOWER(email) = %s AND id <> %s LIMIT 1",
                    (updates["email"], doctor_id),
                )
                if cur.fetchone():
                    return _error(409, "conflict", "email must be unique")

                cur.execute(
                    "SELECT 1 FROM users WHERE LOWER(email) = %s AND doctor_id <> %s LIMIT 1",
                    (updates["email"], doctor_id),
                )
                if cur.fetchone():
                    return _error(409, "conflict", "user with email already exists")

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

            user_updates = {}
            if "full_name" in updates:
                user_updates["name"] = updates["full_name"]
            if "email" in updates:
                user_updates["email"] = updates["email"]
            if "phone" in updates:
                user_updates["phone"] = updates["phone"]

            if user_updates:
                fields = []
                params = []
                for key, value in user_updates.items():
                    fields.append(f"{key} = %s")
                    params.append(value)
                params.append(doctor_id)
                cur.execute(
                    f"UPDATE users SET {', '.join(fields)} WHERE doctor_id = %s;",
                    tuple(params),
                )
        conn.commit()

    return jsonify({"success": True, "data": _serialize_doctor(updated)}), 200


@doctors_bp.route("/api/admin/doctors/<int:doctor_id>/status", methods=["PATCH"])
def admin_update_doctor_status(doctor_id: int):
    guard = _require_admin()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    is_active, err = _coerce_bool(payload.get("is_active"), "is_active")
    if err or is_active is None:
        return _error(400, "validation_error", "is_active must be a boolean")

    row = _fetch_doctor_row(doctor_id)
    if not row:
        return _error(404, "not_found", "Doctor not found")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE doctors
                SET is_active = %s, updated_at = NOW()
                WHERE id = %s
                RETURNING *;
                """,
                (is_active, doctor_id),
            )
            updated = cur.fetchone()
        conn.commit()

    return jsonify({"success": True, "data": _serialize_doctor(updated)}), 200
