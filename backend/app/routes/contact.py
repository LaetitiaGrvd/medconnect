import datetime
import os
import re
from flask import Blueprint, request, jsonify

from app.db import get_connection
from app.routes.utils import success_response
from app.email_utils import send_email


contact_bp = Blueprint("contact", __name__)

ALLOWED_TYPES = {
    "General enquiry",
    "Billing",
    "Appointment support",
    "Technical issue",
    "Feedback",
    "Other",
}


def _normalize_phone(phone: str) -> str:
    return (phone or "").strip()


def _phone_digits_count(phone: str) -> int:
    return len(re.sub(r"\D", "", phone or ""))


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", email or ""))


@contact_bp.post("/api/contact")
def create_contact_message():
    payload = request.get_json(silent=True) or {}

    enquiry_type = (payload.get("type") or "").strip()
    first_name = (payload.get("first_name") or "").strip()
    last_name = (payload.get("last_name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    phone = _normalize_phone(payload.get("phone"))
    message = (payload.get("message") or "").strip()
    consent = payload.get("consent") is True

    field_errors = {}

    if not enquiry_type:
        field_errors["type"] = "Type is required"
    elif enquiry_type not in ALLOWED_TYPES:
        field_errors["type"] = "Invalid enquiry type"

    if not first_name:
        field_errors["first_name"] = "First name is required"

    if not last_name:
        field_errors["last_name"] = "Last name is required"

    if not email:
        field_errors["email"] = "Email is required"
    elif not _is_valid_email(email):
        field_errors["email"] = "Invalid email"

    if not phone:
        field_errors["phone"] = "Phone number is required"
    elif _phone_digits_count(phone) < 7 or not re.match(r"^[0-9+()\-\s]+$", phone or ""):
        field_errors["phone"] = "Enter a valid phone number"

    if not message:
        field_errors["message"] = "Message is required"

    if not consent:
        field_errors["consent"] = "Consent is required"

    if field_errors:
        return jsonify({
            "success": False,
            "error": {
                "message": "Validation error",
                "field_errors": field_errors,
            },
        }), 400

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO contact_messages
                    (type, first_name, last_name, email, phone, message)
                VALUES
                    (%s, %s, %s, %s, %s, %s)
                RETURNING id, created_at;
                """,
                (
                    enquiry_type,
                    first_name,
                    last_name,
                    email,
                    phone,
                    message,
                ),
            )
            row = cur.fetchone()
        conn.commit()

    submitted_at = row.get("created_at")
    if isinstance(submitted_at, datetime.datetime):
        submitted_at = submitted_at.isoformat()

    body = "\n".join([
        f"Type: {enquiry_type}",
        f"Full name: {first_name} {last_name}".strip(),
        f"Email: {email}",
        f"Phone: {phone}",
        "Message:",
        message,
        f"Submitted: {submitted_at or ''}",
    ])

    send_email(
        "l.gooroovadoo@gmail.com",
        "New Contact Us Message",
        body,
    )

    return success_response({"id": row.get("id")}, 201)
