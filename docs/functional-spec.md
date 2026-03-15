# Functional Documentation (Features & Behavior)

## Roles

- **Requester** (`ITSM_REQUESTER`): creates and tracks own incidents/requests, uses portal and knowledge, receives notifications.
- **Agent** (`ITSM_AGENT`): triage/assignment/resolution, approvals, collaboration, operational views.
- **Privileged Admin** (`ITSM_ADMIN` or superuser): access management, configuration, master data, workflows, exports.

## Tickets

Supported kinds:

- Incident
- Service Request
- Problem
- Change

Key fields:

- Number (auto-numbering)
- Title/description
- Priority/urgency/impact
- Status
- Assignment group + assignee (agent-facing)
- SLA due date (computed by SLA policies)

## Service Catalog

- Catalog items are master data (admin-managed).
- Submissions create catalog requests and link tickets.
- Optional approvals generate approval tasks/notifications.

## Knowledge Base

- Draft and published articles
- Search and filter by category/status
- Gamification points can be awarded on publish (configurable)

## CMDB

- Services with owner teams
- Service relationships:
  - depends-on
  - runs-on
- Impact analysis uses relationships to derive impacted services/assets.

## IT Assets

- Asset register with metrics and alerts
- Barcode templates for printing/scanning flows

## Workflows

- Create workflows and versions
- Deploy/rollback concepts (admin-managed)

## Reports & Exports

- Report definitions define datasets
- Report schedules deliver exports on cadence
- “Run due schedules” is an admin action

## Gamification

- Points are recorded as point events (SLA resolutions, KB publish, etc.)
- Achievements computed from activity
- Hall of Fame shows top performers (all-time + monthly)
- Rewards catalog and redemptions (admin-managed)

## Settings

Admin configuration includes:

- Auto-numbering rules
- SLA policies
- Notification webhooks (Teams/Slack)
- AI agent toggles and behavior limits
- Gamification points config + rewards
- Access management (roles + master data)

