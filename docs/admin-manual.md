# Admin Manual

## Login

Use an account with:

- `ITSM_ADMIN` role, or
- Django superuser

## Access Management

Path: **Settings → Access**

- Assign roles to users:
  - `ITSM_ADMIN` (privileged admin)
  - `ITSM_AGENT`
  - `ITSM_REQUESTER`
- Superusers inherently have full privilege.

## Master Data

Path: **Settings → Master Data**

Use the Master Data section to manage configuration tables that drive UI labels, dropdown options, and rule lookups without hardcoding.

### Configuration Catalog (Namespaces + Entries)

Admin can create:

- **Namespaces**: group related configuration (e.g., `ticket_statuses`)
- **Entries**: individual rows with `key`, `label`, and optional JSON `value` (for things like badge tone or rule metadata)

### Common Namespaces (Default)

- `ticket_statuses` (Status labels + badge tone)
- `ticket_priorities` (Priority labels + badge tone)
- `ticket_impacts` (Impact labels + badge tone)
- `ticket_urgencies` (Urgency labels + badge tone)
- `ticket_change_types` (Change type labels + badge tone)
- `ticket_sla_statuses` (SLA status labels + badge tone)
- `ticket_kinds` (Ticket kind labels)
- `ticket_categories` / `ticket_subcategories` (Ticket create form taxonomy)
- `ai_routing_rules` (keyword → assignment group suggestion rules)
- `roles` (RBAC role labels/descriptions for the UI)
- `achievements` (gamification achievement definitions)
- `catalog_request_statuses` (catalog request labels + badge tone)

## Configuration

Path: **Settings**

- Auto-number: ticket numbering prefix and padding
- SLA Config: resolution/at-risk thresholds per kind+priority
- Gamification:
  - point rules (JSON)
  - rewards catalog
- AI Agents:
  - enable/disable
  - max result limit
- Notifications:
  - global Teams/Slack webhooks
- Export Schedules:
  - run due scheduled exports

## Audit & Governance

The system records audit events for key actions (ticket status changes, access updates, etc.). Use the audit API (and related UI if present) for governance.
