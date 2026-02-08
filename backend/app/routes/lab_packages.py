import json
import re
from decimal import Decimal, InvalidOperation
from flask import Blueprint, request, session

from app.db import get_connection
from app.routes.utils import success_response, error_response


lab_packages_bp = Blueprint("lab_packages", __name__)


def _admin_guard():
    role = (session.get("role") or "").strip().lower()
    if not role:
        return error_response(401, "unauthorized", "Unauthorized")
    if role != "admin":
        return error_response(403, "forbidden", "Forbidden")
    return None


def _is_valid_slug(slug: str) -> bool:
    return bool(re.match(r"^[a-z0-9]+(?:-[a-z0-9]+)*$", slug or ""))


def _parse_contents(value):
    if isinstance(value, list):
        items = [str(v).strip() for v in value if str(v).strip()]
        return items
    return None


def _parse_price(value):
    if value is None:
        return None
    try:
        price = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    if price < 0:
        return None
    return price


def _row_to_payload(row):
    contents = row.get("contents")
    if isinstance(contents, str):
        try:
            contents = json.loads(contents)
        except Exception:
            contents = []
    return {
        "id": row.get("id"),
        "slug": row.get("slug"),
        "name": row.get("name"),
        "price_mur": float(row.get("price_mur")) if row.get("price_mur") is not None else 0,
        "currency": row.get("currency"),
        "preparation_note": row.get("preparation_note"),
        "category": row.get("category"),
        "contents": contents or [],
        "sort_order": row.get("sort_order"),
        "is_active": row.get("is_active"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    }


@lab_packages_bp.get("/api/lab-packages")
def list_public_packages():
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, slug, name, price_mur, currency, preparation_note,
                       category, contents
                FROM lab_packages
                WHERE is_active = TRUE
                ORDER BY sort_order ASC, id ASC
                """
            )
            rows = cur.fetchall() or []

    data = []
    for row in rows:
        contents = row.get("contents")
        if isinstance(contents, str):
            try:
                contents = json.loads(contents)
            except Exception:
                contents = []
        data.append({
            "id": row.get("id"),
            "slug": row.get("slug"),
            "name": row.get("name"),
            "price_mur": float(row.get("price_mur")) if row.get("price_mur") is not None else 0,
            "currency": row.get("currency"),
            "preparation_note": row.get("preparation_note"),
            "category": row.get("category"),
            "contents": contents or [],
        })

    return success_response(data)


@lab_packages_bp.get("/api/admin/lab-packages")
def admin_list_packages():
    guard = _admin_guard()
    if guard:
        return guard

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT *
                FROM lab_packages
                ORDER BY sort_order ASC, id ASC
                """
            )
            rows = cur.fetchall() or []

    data = [_row_to_payload(row) for row in rows]
    return success_response(data)


@lab_packages_bp.post("/api/admin/lab-packages")
def admin_create_package():
    guard = _admin_guard()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}

    slug = (payload.get("slug") or "").strip().lower()
    name = (payload.get("name") or "").strip()
    price_mur = _parse_price(payload.get("price_mur"))
    currency = (payload.get("currency") or "MUR").strip().upper() or "MUR"
    preparation_note = payload.get("preparation_note")
    category = payload.get("category")
    contents = _parse_contents(payload.get("contents"))
    sort_order_raw = payload.get("sort_order", 0)

    field_errors = {}

    if not slug:
        field_errors["slug"] = "Slug is required"
    elif not _is_valid_slug(slug):
        field_errors["slug"] = "Slug must be url-friendly"

    if not name:
        field_errors["name"] = "Name is required"

    if price_mur is None:
        field_errors["price_mur"] = "Price must be a number"

    if contents is None or not contents:
        field_errors["contents"] = "Contents must be a non-empty list"

    try:
        sort_order = int(sort_order_raw)
    except (TypeError, ValueError):
        field_errors["sort_order"] = "Sort order must be an integer"
        sort_order = 0

    if field_errors:
        return error_response(400, "validation_error", "Validation error")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM lab_packages WHERE slug = %s", (slug,))
            if cur.fetchone():
                return error_response(409, "conflict", "Slug already exists")

            cur.execute(
                """
                INSERT INTO lab_packages
                    (slug, name, price_mur, currency, preparation_note, category, contents, sort_order)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING *
                """,
                (
                    slug,
                    name,
                    price_mur,
                    currency,
                    preparation_note,
                    category,
                    json.dumps(contents),
                    sort_order,
                ),
            )
            row = cur.fetchone()
        conn.commit()

    return success_response(_row_to_payload(row), 201)


@lab_packages_bp.patch("/api/admin/lab-packages/<int:package_id>")
def admin_update_package(package_id: int):
    guard = _admin_guard()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}

    updates = []
    params = []

    if "slug" in payload:
        slug = (payload.get("slug") or "").strip().lower()
        if not slug:
            return error_response(400, "validation_error", "Slug is required")
        if not _is_valid_slug(slug):
            return error_response(400, "validation_error", "Slug must be url-friendly")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT 1 FROM lab_packages WHERE slug = %s AND id <> %s",
                    (slug, package_id),
                )
                if cur.fetchone():
                    return error_response(409, "conflict", "Slug already exists")
        updates.append("slug = %s")
        params.append(slug)

    if "name" in payload:
        name = (payload.get("name") or "").strip()
        if not name:
            return error_response(400, "validation_error", "Name is required")
        updates.append("name = %s")
        params.append(name)

    if "price_mur" in payload:
        price_mur = _parse_price(payload.get("price_mur"))
        if price_mur is None:
            return error_response(400, "validation_error", "Price must be a number")
        updates.append("price_mur = %s")
        params.append(price_mur)

    if "currency" in payload:
        currency = (payload.get("currency") or "MUR").strip().upper() or "MUR"
        updates.append("currency = %s")
        params.append(currency)

    if "preparation_note" in payload:
        updates.append("preparation_note = %s")
        params.append(payload.get("preparation_note"))

    if "category" in payload:
        updates.append("category = %s")
        params.append(payload.get("category"))

    if "contents" in payload:
        contents = _parse_contents(payload.get("contents"))
        if contents is None or not contents:
            return error_response(400, "validation_error", "Contents must be a non-empty list")
        updates.append("contents = %s")
        params.append(json.dumps(contents))

    if "sort_order" in payload:
        try:
            sort_order = int(payload.get("sort_order"))
        except (TypeError, ValueError):
            return error_response(400, "validation_error", "Sort order must be an integer")
        updates.append("sort_order = %s")
        params.append(sort_order)

    if not updates:
        return error_response(400, "validation_error", "No fields to update")

    updates.append("updated_at = NOW()")
    params.append(package_id)

    sql = "UPDATE lab_packages SET " + ", ".join(updates) + " WHERE id = %s RETURNING *;"

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, tuple(params))
            row = cur.fetchone()
        conn.commit()

    if not row:
        return error_response(404, "not_found", "Lab package not found")

    return success_response(_row_to_payload(row))


@lab_packages_bp.patch("/api/admin/lab-packages/<int:package_id>/status")
def admin_update_status(package_id: int):
    guard = _admin_guard()
    if guard:
        return guard

    payload = request.get_json(silent=True) or {}
    is_active = payload.get("is_active")

    if not isinstance(is_active, bool):
        return error_response(400, "validation_error", "is_active must be boolean")

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE lab_packages SET is_active = %s, updated_at = NOW() WHERE id = %s RETURNING *",
                (is_active, package_id),
            )
            row = cur.fetchone()
        conn.commit()

    if not row:
        return error_response(404, "not_found", "Lab package not found")

    return success_response(_row_to_payload(row))
