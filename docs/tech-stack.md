# Tech Stack

## Backend

- Python (virtual environment under `.venv/`)
- Django (project: `backend/config/`)
- Django REST Framework (API layer)
- django-filter (filtering)
- drf-spectacular (OpenAPI generation, if enabled in settings)
- Database: SQLite for local/dev (`backend/db.sqlite3`)
  - Can be switched to PostgreSQL for production deployments

## Frontend

- React
- TypeScript
- Vite (dev server + production build)
- ESLint (linting)

## Runtime / Deployment

- Dockerfiles exist for `backend/` and `frontend/`
- WSGI/ASGI supported via Django `wsgi.py` / `asgi.py`
- Static content: Vite build output in `frontend/dist/`

