# Integration Documentation

## Webhooks (Teams / Slack)

Purpose: send basic event notifications (e.g., points awarded, war room messages).

Configuration sources:

1. Environment settings:
   - `TEAMS_WEBHOOK_URL`
   - `SLACK_WEBHOOK_URL`
2. Admin-managed settings (preferred for UI-driven configuration):
   - `SystemSetting[key="notifications"]` value:
     - `teams_webhook_url`
     - `slack_webhook_url`

Payload format:

```json
{
  "text": "message text"
}
```

## Email

Password reset and some notifications can be delivered via email depending on Django email configuration in `backend/config/settings.py`.

## API Contract

- Base path: `/api/`
- Auth: token header (frontend uses `apiFetch` helper)
- Common patterns:
  - List endpoints: `GET /api/<resource>/`
  - Detail endpoints: `GET /api/<resource>/<id>/`
  - Create: `POST /api/<resource>/`
  - Update: `PATCH /api/<resource>/<id>/`

## Access Management API (Privileged Admin)

- `GET /api/admin/roles/` → supported role list
- `GET /api/admin/users/` → list users
- `PATCH /api/admin/users/<id>/` → update user roles (Django group membership)

