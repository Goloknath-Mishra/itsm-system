# Deployment Documentation

## Local Development

### Backend

```powershell
cd backend
..\.venv\Scripts\python manage.py migrate
..\.venv\Scripts\python manage.py seed_demo --reset
..\.venv\Scripts\python manage.py runserver 0.0.0.0:8000
```

### Frontend

```powershell
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Open: `http://localhost:5173/`

## GitHub Codespaces

This repository includes a dev container definition so it can run in GitHub Codespaces with consistent tooling.

### One-time setup (Codespace)

1. Open the repo in GitHub and choose: **Code → Codespaces → Create codespace**.
2. The container will run `postCreateCommand` to install:
   - Python dependencies from `requirements.txt`
   - Frontend dependencies via `npm ci`

### Run backend (Codespace terminal)

```bash
source .venv/bin/activate
cd backend
python manage.py migrate
python manage.py seed_demo --reset
python manage.py runserver 0.0.0.0:8000
```

### Run frontend (new Codespace terminal)

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

Codespaces will prompt to open forwarded ports. Use:

- Frontend: `http://localhost:5173/`
- Backend: `http://localhost:8000/` (API base: `http://localhost:8000/api/`)

## Docker

- `backend/Dockerfile`
- `frontend/Dockerfile`

Typical container responsibilities:

- Backend: serves API and (optionally) static content
- Frontend: serves built SPA static assets (or use a separate reverse proxy)

## Environment Configuration

Backend (`backend/config/settings.py`) controls:

- `DATABASE_URL` / DB settings
- Email delivery settings
- Webhook URLs (`TEAMS_WEBHOOK_URL`, `SLACK_WEBHOOK_URL`) optionally overridden by admin settings

## Production Recommendations

- Use PostgreSQL instead of SQLite
- Use Gunicorn/Uvicorn for serving Django
- Put a reverse proxy in front (nginx/traefik) for TLS termination and static caching
- Enable secure cookies, CSRF, and proper CORS configuration
- Configure backups and monitoring
