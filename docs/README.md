# ITSM System Documentation

This folder contains end-to-end documentation for the IT Service Management (ITSM) system, covering functional scope, technical architecture, integrations, deployment, and operating manuals.

## Contents

- [Tech Stack](./tech-stack.md)
- [Technical Architecture](./technical-architecture.md)
- [Functional Architecture](./functional-architecture.md)
- [Functional Documentation](./functional-spec.md)
- [Integration Documentation](./integration.md)
- [Deployment Documentation](./deployment.md)
- [Cloud Deployment (Azure/AWS/GCP/Alibaba)](./cloud-deployment.md)
- [Admin Manual](./admin-manual.md)
- [User Manual](./user-manual.md)

## Source Code Structure (Current)

- `backend/` Django + Django REST Framework API
  - `config/` Django project settings/urls/asgi/wsgi
  - `itsm/` Django app with models, serializers, permissions, and API endpoints
    - `itsm/api/` Feature-oriented backend endpoint modules
- `frontend/` React + TypeScript (Vite)
  - `src/pages/` Route-level pages
  - `src/components/` Shared UI components
  - `src/auth/` Authentication + RBAC helpers
  - `src/config/` Cached loaders for admin-managed config entries (master data)

## Naming & Conventions

- **Backend (Python)**
  - Modules: `snake_case.py`
  - Classes: `PascalCase`
  - Functions: `snake_case()`
  - Use docstrings for public views, serializers, permissions, and non-trivial helpers.
- **Frontend (TypeScript/React)**
  - Components: `PascalCase.tsx`
  - Hooks: `useXxx.ts`
  - Types: `PascalCase` for exported types, `camelCase` for local variables
  - Use a short docblock header for route pages describing purpose and entry points.
