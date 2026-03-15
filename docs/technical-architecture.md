# Technical Architecture

## High-Level Overview

This system is a two-tier web application:

- **Frontend**: React + TypeScript (Vite)
- **Backend**: Django + Django REST Framework (REST API)
- **DB**: SQLite (dev), PostgreSQL recommended for production

```mermaid
flowchart LR
  U[User Browser] -->|HTTPS| FE[React SPA (Vite build)]
  FE -->|REST/JSON| API[Django REST API]
  API --> DB[(Database)]
  API --> EXT[External Integrations]
```

## Backend Components

- `itsm/models.py`
  - Core domain models: Tickets, SLA Policies, CMDB (Services/Relationships), Assets, Knowledge, War Rooms, Workflows, Gamification, Notifications, Settings.
  - Configuration catalog tables: `ConfigNamespace` + `ConfigEntry` used to remove hardcoded UI labels/options and to store simple rule metadata.
- `itsm/serializers.py`
  - DRF serializers for API input/output contracts.
- `itsm/api/*`
  - API implementation modules (views/viewsets grouped by feature area).
- `itsm/views.py`
  - Compatibility re-export layer (keeps import paths stable if needed).
- `itsm/permissions.py`
  - Role-based access checks.
- `itsm/management/commands/seed_demo.py`
  - Demo data generator for end-to-end UI/feature validation.

### Authentication

- Token-based auth is used by the frontend to call the REST API.
- The `/api/me/` endpoint returns user identity and role metadata used by the UI.

### Authorization (RBAC)

Roles are represented using Django Groups:

- `ITSM_ADMIN`: privileged admin (configuration, access mgmt, master data)
- `ITSM_AGENT`: operational ITSM agent
- `ITSM_REQUESTER`: portal/requester

Rules are enforced in the backend (permissions + queryset scoping), and surfaced in the UI (conditional navigation and actions).

## Frontend Components

- `src/App.tsx` defines routes
- `src/Layout.tsx` and `src/components/Sidebar.tsx` implement navigation
- `src/pages/*` route pages and CRUD flows
- `src/auth/*` auth context, token storage, RBAC helpers
- `src/api.ts` API wrapper used by pages
- `src/config/useConfigEntries.ts` cached loader for admin-managed config entries used for enum label rendering and dropdown options

## Data Flow Patterns

- List page → select record → detail page
- Detail page supports actions based on role:
  - Requesters can view and create requests/incidents and track their own records
  - Agents can triage, assign, and resolve
  - Privileged admins can configure: SLA, auto-numbering, master data, workflows, exports, gamification rules

## Audit Logging

Audit events are written on key actions (create/update/status changes, access changes, etc.) and can be exposed via the Audit API.
