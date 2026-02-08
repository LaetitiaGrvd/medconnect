import csv
import io
import json
import os
import re
import uuid
import datetime
from pathlib import Path
from flask import Blueprint, request, send_file, jsonify, session, Response

from app.db import get_connection
from app.routes.utils import success_response, error_response
from app.email_utils import send_email


quote_requests_bp = Blueprint("quote_requests", __name__)

ALLOWED_GENDERS = {"female", "male", "other"}
ALLOWED_STATUS = {"new", "in_review", "contacted", "closed"}
ALLOWED_EXTS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
}
MAX_FILE_SIZE = 5 * 1024 * 1024

UPLOADS_ROOT = Path(os.getenv("UPLOADS_DIR") or (Path(__file__).resolve().parents[2] / "uploads"))
QUOTE_UPLOADS_ROOT = UPLOADS_ROOT / "quote_requests"


def _require_admin():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")
    if role != "admin":
        return error_response(403, "forbidden", "Forbidden")
    return None


def _normalize_phone(phone: str) -> str:
    return (phone or "").strip()


def _phone_digits_count(phone: str) -> int:
    return len(re.sub(r"\D", "", phone or ""))


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


def _parse_service_categories(form):
    values = form.getlist("service_categories") or form.getlist("service_categories[]")
    if len(values) == 1:
        raw = values[0]
        if raw and raw.strip().startswith("["):
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, list):
                    return [str(v).strip() for v in parsed if str(v).strip()]
            except Exception:
                return values
    return [str(v).strip() for v in values if str(v).strip()]


def _file_size(file_storage) -> int:
    stream = file_storage.stream
    stream.seek(0, os.SEEK_END)
    size = stream.tell()
    stream.seek(0)
    return size


def _validate_file(file_storage):
    if not file_storage or not file_storage.filename:
        return "File is required"

    ext = os.path.splitext(file_storage.filename)[1].lower()
    if ext not in ALLOWED_EXTS:
        return "Invalid file type"

    if file_storage.mimetype and file_storage.mimetype not in ALLOWED_MIMES:
        return "Invalid file type"

    size = _file_size(file_storage)
    if size <= 0:
        return "File is empty"
    if size > MAX_FILE_SIZE:
        return "File exceeds 5 MB"

    return None


def _save_file(file_storage, folder: Path) -> dict:
    ext = os.path.splitext(file_storage.filename)[1].lower()
    stored_name = f"{uuid.uuid4().hex}{ext}"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / stored_name
    file_storage.save(str(target))

    return {
        "stored_filename": stored_name,
        "original_filename": file_storage.filename,
        "mime": file_storage.mimetype or "application/octet-stream",
        "size": _file_size(file_storage),
    }


def _categories_from_row(raw):
    if raw is None:
        return []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(v) for v in parsed]
    except Exception:
        pass
    return []


@quote_requests_bp.post("/api/quote-requests")
def create_quote_request():
    # Rate limiting placeholder: consider throttling by IP/email in production.
    form = request.form
    files = request.files

    first_name = (form.get("first_name") or "").strip()
    last_name = (form.get("last_name") or "").strip()
    gender = (form.get("gender") or "").strip().lower()
    dob_raw = (form.get("dob") or "").strip()
    phone = _normalize_phone(form.get("phone"))
    email = (form.get("email") or "").strip().lower()
    message = (form.get("message") or "").strip()
    doctor_id_raw = (form.get("doctor_id") or "").strip()

    service_categories = _parse_service_categories(form)

    documents = files.getlist("documents") + files.getlist("documents[]")
    id_document = files.get("id_document")

    field_errors = {}

    if not first_name:
        field_errors["first_name"] = "First name is required"
    if not last_name:
        field_errors["last_name"] = "Last name is required"
    if gender not in ALLOWED_GENDERS:
        field_errors["gender"] = "Gender is required"

    dob = None
    if not dob_raw:
        field_errors["dob"] = "Date of birth is required"
    else:
        try:
            dob = datetime.date.fromisoformat(dob_raw)
        except ValueError:
            field_errors["dob"] = "Invalid date of birth"

    if not phone:
        field_errors["phone"] = "Phone number is required"
    elif _phone_digits_count(phone) < 7:
        field_errors["phone"] = "Phone number must contain at least 7 digits"

    if not email:
        field_errors["email"] = "Email is required"
    elif not _is_valid_email(email):
        field_errors["email"] = "Invalid email"

    if not service_categories:
        field_errors["service_categories"] = "Select at least one service category"

    if not message:
        field_errors["message"] = "Message is required"

    if not id_document:
        field_errors["id_document"] = "Identity document is required"
    else:
        err = _validate_file(id_document)
        if err:
            field_errors["id_document"] = err

    valid_documents = []
    for doc in documents:
        if not doc or not doc.filename:
            continue
        err = _validate_file(doc)
        if err:
            field_errors["documents"] = err
            break
        valid_documents.append(doc)

    doctor_id = None
    preferred_doctor = None
    if doctor_id_raw:
        try:
            doctor_id = int(doctor_id_raw)
        except ValueError:
            field_errors["doctor_id"] = "Invalid doctor selection"

    if field_errors:
        return jsonify({
            "success": False,
            "error": {
                "message": "Validation error",
                "field_errors": field_errors,
            },
        }), 400

    if doctor_id is not None:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, full_name FROM doctors WHERE id = %s AND is_active = TRUE",
                    (doctor_id,),
                )
                doc_row = cur.fetchone()
                if not doc_row:
                    return jsonify({
                        "success": False,
                        "error": {
                            "message": "Validation error",
                            "field_errors": {"doctor_id": "Selected doctor is not available"},
                        },
                    }), 400
                preferred_doctor = doc_row.get("full_name")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO quote_requests
                    (first_name, last_name, gender, dob, phone, email, service_categories,
                     doctor_id, message, status)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at;
                """,
                (
                    first_name,
                    last_name,
                    gender,
                    dob,
                    phone,
                    email,
                    json.dumps(service_categories),
                    doctor_id,
                    message,
                    "new",
                ),
            )
            row = cur.fetchone()
            quote_request_id = row.get("id")
            created_at = row.get("created_at")
        conn.commit()

    folder = QUOTE_UPLOADS_ROOT / str(quote_request_id)

    if id_document:
        saved = _save_file(id_document, folder)
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO quote_request_files
                        (quote_request_id, kind, stored_filename, original_filename, mime, size)
                    VALUES
                        (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        quote_request_id,
                        "id",
                        saved["stored_filename"],
                        saved["original_filename"],
                        saved["mime"],
                        saved["size"],
                    ),
                )
            conn.commit()

    for doc in valid_documents:
        saved = _save_file(doc, folder)
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO quote_request_files
                        (quote_request_id, kind, stored_filename, original_filename, mime, size)
                    VALUES
                        (%s, %s, %s, %s, %s, %s)
                    """,
                    (
                        quote_request_id,
                        "documents",
                        saved["stored_filename"],
                        saved["original_filename"],
                        saved["mime"],
                        saved["size"],
                    ),
                )
            conn.commit()

    uploaded_files_count = len(valid_documents) + (1 if id_document else 0)
    submitted_at = created_at.isoformat() if isinstance(created_at, datetime.datetime) else ""
    categories_text = ", ".join(service_categories)

    body = "\n".join([
        f"Full name: {first_name} {last_name}".strip(),
        f"Email: {email}",
        f"Phone: {phone}",
        f"Selected service categories: {categories_text}",
        f"Preferred doctor: {preferred_doctor or 'Not specified'}",
        "Message:",
        message,
        f"Uploaded files count: {uploaded_files_count}",
        f"Quote request ID: {quote_request_id}",
        f"Submitted: {submitted_at}",
    ])

    send_email(
        "l.gooroovadoo@gmail.com",
        "New Quote Request Received",
        body,
    )

    return success_response({"id": quote_request_id}, 201)


@quote_requests_bp.get("/api/admin/quote-requests")
def admin_list_quote_requests():
    guard = _require_admin()
    if guard:
        return guard

    status = (request.args.get("status") or "").strip().lower()
    q = (request.args.get("q") or "").strip()
    from_date = (request.args.get("from") or "").strip()
    to_date = (request.args.get("to") or "").strip()

    filters = []
    params = []

    if status:
        filters.append("qr.status = %s")
        params.append(status)

    if q:
        filters.append(
            "(LOWER(qr.first_name) LIKE %s OR LOWER(qr.last_name) LIKE %s OR LOWER(qr.email) LIKE %s "
            "OR LOWER(qr.phone) LIKE %s OR LOWER(qr.message) LIKE %s)"
        )
        like = f"%{q.lower()}%"
        params.extend([like, like, like, like, like])

    if from_date:
        try:
            datetime.date.fromisoformat(from_date)
            filters.append("qr.created_at::date >= %s")
            params.append(from_date)
        except ValueError:
            pass

    if to_date:
        try:
            datetime.date.fromisoformat(to_date)
            filters.append("qr.created_at::date <= %s")
            params.append(to_date)
        except ValueError:
            pass

    sql = """
        SELECT qr.id, qr.first_name, qr.last_name, qr.email, qr.phone,
               qr.status, qr.service_categories, qr.created_at,
               d.full_name AS doctor_name
        FROM quote_requests qr
        LEFT JOIN doctors d ON d.id = qr.doctor_id
    """

    if filters:
        sql += " WHERE " + " AND ".join(filters)

    sql += " ORDER BY qr.created_at DESC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []

    items = []
    for r in rows:
        categories = _categories_from_row(r.get("service_categories"))
        items.append({
            "id": r.get("id"),
            "created_at": r.get("created_at"),
            "full_name": f"{r.get('first_name')} {r.get('last_name')}".strip(),
            "email": r.get("email"),
            "phone": r.get("phone"),
            "status": r.get("status"),
            "preferred_doctor": r.get("doctor_name"),
            "categories": categories,
        })

    return success_response({"count": len(items), "items": items})


@quote_requests_bp.get("/api/admin/quote-requests/export")
def admin_export_quote_requests():
    guard = _require_admin()
    if guard:
        return guard

    status = (request.args.get("status") or "").strip().lower()
    q = (request.args.get("q") or "").strip()
    from_date = (request.args.get("from") or "").strip()
    to_date = (request.args.get("to") or "").strip()

    filters = []
    params = []

    if status:
        filters.append("qr.status = %s")
        params.append(status)

    if q:
        filters.append(
            "(LOWER(qr.first_name) LIKE %s OR LOWER(qr.last_name) LIKE %s OR LOWER(qr.email) LIKE %s "
            "OR LOWER(qr.phone) LIKE %s OR LOWER(qr.message) LIKE %s)"
        )
        like = f"%{q.lower()}%"
        params.extend([like, like, like, like, like])

    if from_date:
        try:
            datetime.date.fromisoformat(from_date)
            filters.append("qr.created_at::date >= %s")
            params.append(from_date)
        except ValueError:
            pass

    if to_date:
        try:
            datetime.date.fromisoformat(to_date)
            filters.append("qr.created_at::date <= %s")
            params.append(to_date)
        except ValueError:
            pass

    sql = """
        SELECT qr.id, qr.first_name, qr.last_name, qr.email, qr.phone,
               qr.gender, qr.dob, qr.status, qr.service_categories,
               qr.message, qr.admin_notes, qr.created_at,
               d.full_name AS doctor_name
        FROM quote_requests qr
        LEFT JOIN doctors d ON d.id = qr.doctor_id
    """

    if filters:
        sql += " WHERE " + " AND ".join(filters)

    sql += " ORDER BY qr.created_at DESC"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            rows = cur.fetchall() or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "id",
        "created_at",
        "first_name",
        "last_name",
        "email",
        "phone",
        "gender",
        "dob",
        "status",
        "service_categories",
        "preferred_doctor",
        "message",
        "admin_notes",
    ])

    for r in rows:
        categories = _categories_from_row(r.get("service_categories"))
        writer.writerow([
            r.get("id"),
            r.get("created_at"),
            r.get("first_name"),
            r.get("last_name"),
            r.get("email"),
            r.get("phone"),
            r.get("gender"),
            r.get("dob"),
            r.get("status"),
            ", ".join(categories),
            r.get("doctor_name"),
            r.get("message"),
            r.get("admin_notes"),
        ])

    csv_data = output.getvalue()
    headers = {
        "Content-Disposition": "attachment; filename=quote-requests-export.csv"
    }
    return Response(csv_data, mimetype="text/csv; charset=utf-8", headers=headers)


@quote_requests_bp.get("/api/admin/quote-requests/<int:quote_request_id>")
def admin_get_quote_request(quote_request_id: int):
    guard = _require_admin()
    if guard:
        return guard

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT qr.*, d.full_name AS doctor_name
                FROM quote_requests qr
                LEFT JOIN doctors d ON d.id = qr.doctor_id
                WHERE qr.id = %s
                """,
                (quote_request_id,),
            )
            row = cur.fetchone()

            if not row:
                return error_response(404, "not_found", "Quote request not found")

            cur.execute(
                """
                SELECT *
                FROM quote_request_files
                WHERE quote_request_id = %s
                ORDER BY created_at ASC
                """,
                (quote_request_id,),
            )
            files = cur.fetchall() or []

    categories = _categories_from_row(row.get("service_categories"))

    request_data = {
        "id": row.get("id"),
        "first_name": row.get("first_name"),
        "last_name": row.get("last_name"),
        "gender": row.get("gender"),
        "dob": row.get("dob"),
        "phone": row.get("phone"),
        "email": row.get("email"),
        "service_categories": categories,
        "doctor_id": row.get("doctor_id"),
        "preferred_doctor": row.get("doctor_name"),
        "message": row.get("message"),
        "status": row.get("status"),
        "admin_notes": row.get("admin_notes"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }

    file_items = []
    for f in files:
        file_items.append({
            "id": f.get("id"),
            "kind": f.get("kind"),
            "original_filename": f.get("original_filename"),
            "size": f.get("size"),
            "mime": f.get("mime"),
            "download_url": f"/api/admin/quote-requests/{quote_request_id}/files/{f.get('id')}/download",
        })

    return success_response({"request": request_data, "files": file_items})


@quote_requests_bp.patch("/api/admin/quote-requests/<int:quote_request_id>")
def admin_update_quote_request(quote_request_id: int):
    guard = _require_admin()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    status = (payload.get("status") or "").strip().lower()
    admin_notes = payload.get("admin_notes")

    updates = []
    params = []

    if status:
        if status not in ALLOWED_STATUS:
            return error_response(400, "validation_error", "Invalid status")
        updates.append("status = %s")
        params.append(status)

    if admin_notes is not None:
        updates.append("admin_notes = %s")
        params.append(admin_notes)

    if not updates:
        return error_response(400, "validation_error", "No fields to update")

    updates.append("updated_at = NOW()")
    params.append(quote_request_id)

    sql = "UPDATE quote_requests SET " + ", ".join(updates) + " WHERE id = %s RETURNING *;"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            row = cur.fetchone()
        conn.commit()

    if not row:
        return error_response(404, "not_found", "Quote request not found")

    return success_response({
        "id": row.get("id"),
        "status": row.get("status"),
        "admin_notes": row.get("admin_notes"),
        "updated_at": row.get("updated_at"),
    })


@quote_requests_bp.get("/api/admin/quote-requests/<int:quote_request_id>/files/<int:file_id>/download")
def admin_download_quote_request_file(quote_request_id: int, file_id: int):
    guard = _require_admin()
    if guard:
        return guard

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM quote_request_files
                WHERE id = %s AND quote_request_id = %s
                LIMIT 1
                """,
                (file_id, quote_request_id),
            )
            row = cur.fetchone()

    if not row:
        return error_response(404, "not_found", "File not found")

    stored = row.get("stored_filename")
    original = row.get("original_filename")
    file_path = QUOTE_UPLOADS_ROOT / str(quote_request_id) / stored

    if not file_path.exists():
        return error_response(404, "not_found", "File not found")

    return send_file(
        str(file_path),
        as_attachment=True,
        download_name=original,
    )
