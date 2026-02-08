# MedConnect Handover Setup Guide

This guide helps a new owner set up the project locally and deploy it on Render.

## 1) Prerequisites
- Git
- Python 3.11+
- PostgreSQL (local) or Render Postgres

Optional for local static hosting:
- Any static server (`python -m http.server` is enough)

## 2) Create the Student’s Git Repo
1. Create a new repo on the student’s Git account.
2. In the project root:
   - `git init`
   - `git add .`
   - `git commit -m "Initial import"`
   - `git remote add origin <their-repo-url>`
   - `git push -u origin main`

## 3) Local Backend Setup
1. Create and activate a virtualenv.
2. Install dependencies:
   - `pip install -r backend/requirements.txt`
3. Set environment variables:
   - `DATABASE_URL=postgres://...`
   - `SECRET_KEY=...`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (if email is required)
   - `ADMIN_NOTIFY_EMAIL` (or `CONTACT_NOTIFY_EMAIL` / `QUOTE_NOTIFY_EMAIL`)
4. Run migrations:
   - `python -c "from app.db import init_db; init_db()"`
5. Start backend:
   - `python -m app` (or the current backend run command used in your environment)

## 4) Local Frontend Setup
1. Update `frontend/js/config.js`:
   - `window.API_BASE_URL = "http://localhost:<backend_port>"`
2. Serve the frontend:
   - `cd frontend`
   - `python -m http.server 8080`
3. Open `http://localhost:8080` in a browser.

## 5) Render Deployment (Recommended)

### Backend (Python Web Service)
1. Create a new Render Web Service from the student’s repo.
2. Set:
   - **Build command:** `pip install -r backend/requirements.txt`
   - **Start command:** use the project’s backend start command (same as local)
3. Add environment variables:
   - `DATABASE_URL` (from Render Postgres)
   - `SECRET_KEY`
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` (optional)
   - `ADMIN_NOTIFY_EMAIL` (or `CONTACT_NOTIFY_EMAIL` / `QUOTE_NOTIFY_EMAIL`)

### Database (Render Postgres)
1. Create a Render Postgres instance.
2. Copy its `DATABASE_URL` into the backend env vars.
3. Run migrations once:
   - `python -c "from app.db import init_db; init_db()"`

### Frontend (Static Site)
1. Create a Render Static Site from the student’s repo.
2. Set:
   - **Publish directory:** `frontend`
   - **Build command:** none
3. Update `frontend/js/config.js`:
   - `window.API_BASE_URL = "https://<backend-service>.onrender.com"`

### CORS Update
In `backend/app/__init__.py`, update the allowed frontend origin:
```
origins = ["https://<frontend-site>.onrender.com"]
```

## 6) Sanity Tests
1. Open the frontend URL.
2. Check `/api/health` returns success.
3. Submit the Contact and Request Quote forms.
4. Verify notification emails arrive at the configured address.

## 7) Optional Cleanup
If you want a clean demo database, delete old data by email:
```
DELETE FROM contact_messages WHERE email ILIKE '%example%';
DELETE FROM quote_requests WHERE email ILIKE '%example%';
DELETE FROM appointments WHERE email ILIKE '%example%';
DELETE FROM users WHERE email ILIKE '%example%';
DELETE FROM password_reset_requests WHERE email ILIKE '%example%';
```

---
If you want this guide tailored to the exact run command or hosting provider, update the relevant sections and re-share it with the student.
