from pathlib import Path
from flask import Blueprint, send_from_directory, abort


uploads_bp = Blueprint("uploads", __name__)

AVATARS_DIR = Path(__file__).resolve().parents[2] / "uploads" / "avatars"


@uploads_bp.get("/uploads/avatars/<path:filename>")
def serve_avatar(filename: str):
    if not filename or "/" in filename or "\\" in filename:
        return abort(404)
    if not AVATARS_DIR.exists():
        return abort(404)
    return send_from_directory(AVATARS_DIR, filename)
