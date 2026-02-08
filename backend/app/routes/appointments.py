import csv
import io
from flask import Blueprint, jsonify, request, session, Response

from app.db import get_connection
from app.routes.utils import success_response, error_response
from sms import send_sms

appointments_bp = Blueprint("appointments", __name__)


def _require_admin():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")
    if role != "admin":
        return error_response(403, "forbidden", "Forbidden")
    return None


def fetch_doctor(doctor_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, full_name, specialty, is_active
                FROM doctors
                WHERE id = %s
                LIMIT 1
                """,
                (doctor_id,),
            )
            return cur.fetchone()


def fetch_one(appt_id: int):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM appointments WHERE id = %s", (appt_id,))
            return cur.fetchone()


@appointments_bp.get("/api/admin/appointments/export")
def admin_export_appointments():
    guard = _require_admin()
    if guard:
        return guard

    status = (request.args.get("status") or "").strip().lower()
    doctor_id = (request.args.get("doctor_id") or "").strip()
    from_date = (request.args.get("from") or "").strip()
    to_date = (request.args.get("to") or "").strip()

    where = []
    params = []

    if status:
        where.append("LOWER(COALESCE(status, '')) = %s")
        params.append(status)

    if doctor_id:
        try:
            did = int(doctor_id)
            where.append("doctor_id = %s")
            params.append(did)
        except ValueError:
            return error_response(400, "validation_error", "doctor_id must be an integer")

    if from_date:
        where.append("date >= %s")
        params.append(from_date)

    if to_date:
        where.append("date <= %s")
        params.append(to_date)

    sql = """
        SELECT id, date, time, name, email, phone, doctor, specialty, status, doctor_id
        FROM appointments
    """
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY date DESC, time DESC, id DESC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "date",
        "time",
        "patient_name",
        "patient_email",
        "patient_phone",
        "doctor_name",
        "doctor_id",
        "specialty",
        "status",
    ])

    for r in rows:
        writer.writerow([
            r.get("id"),
            r.get("date"),
            r.get("time"),
            r.get("name"),
            r.get("email"),
            r.get("phone"),
            r.get("doctor"),
            r.get("doctor_id"),
            r.get("specialty"),
            r.get("status"),
        ])

    csv_data = output.getvalue()
    headers = {
        "Content-Disposition": "attachment; filename=appointments-export.csv"
    }
    return Response(csv_data, mimetype="text/csv; charset=utf-8", headers=headers)

@appointments_bp.route("/api/appointments/slots", methods=["GET"])
def get_booked_slots():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")

    doctor_id = request.args.get("doctor_id")
    date = request.args.get("date")

    if not doctor_id or not date:
        return error_response(400, "validation_error", "doctor_id and date are required")

    try:
        did = int(doctor_id)
    except ValueError:
        return error_response(400, "validation_error", "doctor_id must be an integer")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT time, status
                FROM appointments
                WHERE doctor_id = %s AND date = %s
                """,
                (did, date),
            )
            rows = cur.fetchall()

    booked = []
    for row in rows or []:
        status = str(row.get("status") or "").strip().lower()
        if status == "cancelled":
            continue
        t = str(row.get("time") or "").strip()
        if t:
            booked.append(t)

    return success_response({
        "doctor_id": did,
        "date": date,
        "booked": sorted(list(set(booked))),
    })


@appointments_bp.route("/api/appointments", methods=["GET"])
def list_appointments():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")

    where = []
    params = []

    doctor_id = request.args.get("doctor_id")
    email = request.args.get("email")

    if role == "patient":
        sess_email = (session.get("email") or "").strip().lower()
        email = sess_email

    if role == "doctor":
        sess_doctor_id = session.get("doctor_id")
        if sess_doctor_id is not None:
            doctor_id = str(sess_doctor_id)

    if doctor_id is not None:
        try:
            did = int(doctor_id)
        except ValueError:
            return error_response(400, "validation_error", "doctor_id must be an integer")
        where.append("doctor_id = %s")
        params.append(did)

    if email:
        where.append("LOWER(email) = %s")
        params.append(str(email).strip().lower())

    sql = "SELECT * FROM appointments"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY id DESC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()

    return success_response({"count": len(rows), "items": rows})


@appointments_bp.route("/api/appointments", methods=["POST"])
def create_appointment():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")
    if role != "patient":
        return error_response(403, "forbidden", "Forbidden")

    payload = request.get_json(silent=True) or {}

    required = ["specialty", "doctor", "date", "time", "name", "phone", "email", "doctor_id"]
    missing = [k for k in required if not payload.get(k)]
    if missing:
        return error_response(400, "validation_error", "Missing required fields")

    sess_email = (session.get("email") or "").strip().lower()
    req_email = str(payload.get("email") or "").strip().lower()
    if sess_email and req_email and sess_email != req_email:
        return error_response(403, "forbidden", "Forbidden")

    try:
        doctor_id = int(payload["doctor_id"])
    except (TypeError, ValueError):
        return error_response(400, "validation_error", "doctor_id must be an integer")

    doctor = fetch_doctor(doctor_id)
    if not doctor or not doctor.get("is_active"):
        return error_response(400, "validation_error", f"Invalid doctor_id: {doctor_id}")

    doctor_name = str(payload.get("doctor", "")).strip().lower()
    full_name = str(doctor.get("full_name", "")).strip().lower()
    if doctor_name and full_name and doctor_name != full_name:
        return error_response(400, "validation_error", "doctor_id does not match selected doctor name")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1
                FROM appointments
                WHERE doctor_id = %s AND date = %s AND time = %s
                  AND LOWER(COALESCE(status, '')) <> 'cancelled'
                LIMIT 1;
                """,
                (doctor_id, payload["date"], payload["time"]),
            )
            if cur.fetchone():
                return error_response(409, "conflict", "Selected slot is no longer available")

            cur.execute(
                """
                INSERT INTO appointments
                    (doctor_id, doctor, specialty, date, time, name, email, phone, status)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *;
                """,
                (
                    doctor_id,
                    payload["doctor"],
                    payload["specialty"],
                    payload["date"],
                    payload["time"],
                    payload["name"],
                    payload["email"],
                    payload["phone"],
                    "booked",
                ),
            )
            appt = cur.fetchone()
        conn.commit()

    sms_result = {"ok": False, "error": "not_sent"}
    try:
        sms_text = (
            f"MedConnect: Appointment confirmed with {appt['doctor']} "
            f"on {appt['date']} at {appt['time']}."
        )
        sms_result = send_sms(appt["phone"], sms_text)
    except Exception as e:
        sms_result = {"ok": False, "error": str(e)}

    return success_response({
        "appointment": appt,
        "sms": {
            "sent": bool(sms_result.get("ok")),
            "sid": sms_result.get("sid"),
            "error": sms_result.get("error") if not sms_result.get("ok") else None,
        },
    }, 201)


@appointments_bp.route("/api/appointments/<int:appt_id>", methods=["PATCH"])
def update_appointment(appt_id: int):
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")

    payload = request.get_json(silent=True) or {}
    new_status = str(payload.get("status", "")).strip().lower()

    allowed = {"booked", "confirmed", "cancelled", "completed"}
    if not new_status or new_status not in allowed:
        return error_response(400, "validation_error", "Invalid status")

    appt = fetch_one(appt_id)
    if not appt:
        return error_response(404, "not_found", "Appointment not found")

    if role == "patient":
        appt_email = str(appt.get("email") or "").strip().lower()
        sess_email = str(session.get("email") or "").strip().lower()
        if sess_email != appt_email:
            return error_response(403, "forbidden", "Forbidden")
        if new_status != "cancelled":
            return error_response(403, "forbidden", "Forbidden")
    elif role in ("doctor", "admin"):
        pass
    else:
        return error_response(403, "forbidden", "Forbidden")

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

    return success_response({
        "appointment": updated,
        "sms": {
            "sent": bool(sms_result.get("ok")),
            "sid": sms_result.get("sid"),
            "error": sms_result.get("error") if not sms_result.get("ok") else None,
        },
    })
