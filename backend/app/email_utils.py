import os
import smtplib
from email.message import EmailMessage

try:
    from flask import current_app
except Exception:  # pragma: no cover - used only when flask context is absent
    current_app = None


def send_email(to_address: str, subject: str, body: str) -> bool:
    host = os.getenv("SMTP_HOST") or ""
    if not host.strip():
        _log_warning("SMTP_HOST not set; skipping email send.")
        return False

    port = int(os.getenv("SMTP_PORT", "587"))
    username = os.getenv("SMTP_USER") or os.getenv("SMTP_USERNAME") or ""
    password = os.getenv("SMTP_PASSWORD") or ""
    from_address = os.getenv("SMTP_FROM") or username or "no-reply@medconnect.local"

    use_ssl = os.getenv("SMTP_USE_SSL", "false").strip().lower() in {"1", "true", "yes"}
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() not in {"0", "false", "no"}

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_address
    msg["To"] = to_address
    msg.set_content(body or "")

    try:
        if use_ssl:
            server = smtplib.SMTP_SSL(host, port, timeout=10)
        else:
            server = smtplib.SMTP(host, port, timeout=10)

        with server:
            server.ehlo()
            if use_tls and not use_ssl:
                server.starttls()
                server.ehlo()
            if username and password:
                server.login(username, password)
            server.send_message(msg)
        return True
    except Exception as exc:
        _log_exception("Email send failed", exc)
        return False


def _log_warning(message: str) -> None:
    if current_app:
        current_app.logger.warning(message)
    else:
        print(message)


def _log_exception(message: str, exc: Exception) -> None:
    if current_app:
        current_app.logger.exception("%s: %s", message, exc)
    else:
        print(f"{message}: {exc}")
