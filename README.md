# ITSM System

Full-stack IT Service Management (ITSM) application.

## Quick Start (Local)

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

## Documentation

See [docs/README.md](./docs/README.md) for:

- Technical documentation
- Functional documentation
- Integration documentation
- Deployment documentation
- Cloud deployment guides (Azure/AWS/GCP/Alibaba)
- Admin manual
- User manual

## GitHub Codespaces

This repo includes a dev container configuration under `.devcontainer/` so it can be opened directly in GitHub Codespaces.
