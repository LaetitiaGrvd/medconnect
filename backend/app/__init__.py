import os
from flask import Flask
from flask_cors import CORS

app = Flask(__name__)

app.secret_key = os.environ.get("SECRET_KEY", "dev-secret-key")

app.config.update(
    SESSION_COOKIE_SAMESITE="None",
    SESSION_COOKIE_SECURE=True,
)

CORS(
    app,
    supports_credentials=True,
    resources={r"/api/*": {"origins": [
        "https://medconnect-frontend-fy9z.onrender.com"
    ]}}
)

from app.routes.reports import reports_bp
from app.routes.appointments import appointments_bp
from app.routes.doctors import doctors_bp
from app.routes.doctor import doctor_bp
from app.routes.auth import auth_bp
from app.routes.db_health import db_health_bp
from app.routes.quote_requests import quote_requests_bp
from app.routes.contact import contact_bp
from app.routes.lab_packages import lab_packages_bp
from app.routes.uploads import uploads_bp
from availability import availability_bp

app.register_blueprint(appointments_bp)
app.register_blueprint(doctors_bp)
app.register_blueprint(doctor_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(db_health_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(availability_bp)
app.register_blueprint(quote_requests_bp)
app.register_blueprint(contact_bp)
app.register_blueprint(lab_packages_bp)
app.register_blueprint(uploads_bp)


@app.get("/api/health")
def health():
    return {"success": True, "data": {"status": "ok"}}, 200
