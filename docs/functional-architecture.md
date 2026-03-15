# Functional Architecture

## Major Modules

```mermaid
flowchart TB
  PORTAL[Portal / Requester Experience]
  OPS[Agent Operations]
  ADMIN[Admin & Configuration]
  INT[Integrations]

  PORTAL --> INC[Incidents]
  PORTAL --> SR[Service Requests / Catalog]
  PORTAL --> KB[Knowledge Search]
  PORTAL --> NOTIF[Notifications]

  OPS --> PROB[Problem Management]
  OPS --> CHG[Change Management]
  OPS --> WAR[War Rooms / Collaboration]
  OPS --> CMDB[CMDB & Impact]
  OPS --> ASSET[IT Assets]

  ADMIN --> SLA[SLA Policies]
  ADMIN --> AUTO[Auto-numbering]
  ADMIN --> MASTER[Master Data (Teams, Catalog, Services)]
  ADMIN --> WF[Workflows]
  ADMIN --> REP[Reports & Scheduled Exports]
  ADMIN --> GAME[Gamification & Rewards]
  ADMIN --> ACCESS[Access Management (RBAC)]

  INT --> WEBHOOKS[Teams/Slack Webhooks]
  INT --> EMAIL[Email Notifications]
```

## End-to-End Lifecycle (Typical Incident)

1. Requester creates an incident (Portal or Incidents).
2. Agent triages, assigns team/assignee, and starts progress.
3. SLA timer and due dates are applied based on priority and SLA policy.
4. Agent resolves and closes; points are awarded if within SLA (gamification).
5. Notification and audit events are recorded.

## End-to-End Lifecycle (Service Request)

1. Requester browses catalog and submits request.
2. System creates/links a ticket for tracking.
3. If approval required, approval task is created for an approver (agent/admin).
4. Fulfillment progresses to completion.

## Problem → Known Error → Knowledge

1. Agent creates a Problem ticket for recurring incidents.
2. Agent documents a Known Error (symptoms/workaround) and links to KB.
3. Known Error becomes searchable from problem detail and the problem module.

## Change → CAB

1. Agent submits Change request (standard/normal/emergency).
2. Privileged admin schedules CAB meeting and links change tickets.
3. Change execution and post-implementation review occurs.

