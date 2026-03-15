"""Demo data seeder for the ITSM system.

Creates a realistic set of records so that the UI can be validated end-to-end:
- Users + RBAC groups
- Teams, services, CMDB relationships
- Incidents/requests/problems/changes and related objects
- Knowledge, war rooms, workflows
- Gamification (points, badges, rewards) and configuration settings
"""

import os
import random
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from itsm.models import (
    Asset,
    AssetAlert,
    AssetMetric,
    AssetRecommendation,
    AssetTransaction,
    BarcodeTemplate,
    CabMeeting,
    CatalogItem,
    CatalogRequest,
    KnowledgeArticle,
    PointEvent,
    ReportDefinition,
    ReportSchedule,
    Reward,
    RewardRedemption,
    KnownError,
    Service,
    ServiceRelationship,
    SlaPolicy,
    ConfigEntry,
    ConfigNamespace,
    SystemSetting,
    Team,
    TeamChallenge,
    Ticket,
    TicketApproval,
    TicketComment,
    TicketNumberConfig,
    UserBadge,
    WarRoom,
    WarRoomMessage,
    WarRoomParticipant,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
)

User = get_user_model()


def _pick(seq):
    """Return a random element from a sequence-like."""
    return random.choice(list(seq))


class Command(BaseCommand):
    help = "Seed the database with demo data for ITSM features (idempotent)."

    def add_arguments(self, parser):
        parser.add_argument("--tickets", type=int, default=12)
        parser.add_argument("--assets", type=int, default=8)
        parser.add_argument("--knowledge", type=int, default=6)
        parser.add_argument("--reset", action="store_true")

    @transaction.atomic
    def handle(self, *args, **options):
        """Seed demo records. Use --reset to delete existing demo data first."""
        tickets_n = int(options["tickets"])
        assets_n = int(options["assets"])
        knowledge_n = int(options["knowledge"])
        reset = bool(options["reset"])

        random.seed(7)
        now = timezone.now()

        if reset:
            WorkflowRun.objects.all().delete()
            WorkflowVersion.objects.all().delete()
            Workflow.objects.all().delete()
            RewardRedemption.objects.all().delete()
            Reward.objects.all().delete()
            SystemSetting.objects.all().delete()
            TicketNumberConfig.objects.all().delete()
            AssetAlert.objects.all().delete()
            AssetMetric.objects.all().delete()
            AssetRecommendation.objects.all().delete()
            AssetTransaction.objects.all().delete()
            BarcodeTemplate.objects.all().delete()
            ReportSchedule.objects.all().delete()
            ReportDefinition.objects.all().delete()
            TeamChallenge.objects.all().delete()
            UserBadge.objects.all().delete()
            PointEvent.objects.all().delete()
            WarRoomMessage.objects.all().delete()
            WarRoomParticipant.objects.all().delete()
            WarRoom.objects.all().delete()
            CabMeeting.objects.all().delete()
            KnownError.objects.all().delete()
            TicketApproval.objects.all().delete()
            TicketComment.objects.all().delete()
            CatalogRequest.objects.all().delete()
            CatalogItem.objects.all().delete()
            Asset.objects.all().delete()
            KnowledgeArticle.objects.all().delete()
            Ticket.objects.all().delete()
            ServiceRelationship.objects.all().delete()
            Service.objects.all().delete()
            Team.objects.all().delete()

        demo_password = os.getenv("DEMO_PASSWORD", "admin")

        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={"email": "admin@example.com", "is_staff": True, "is_superuser": True},
        )
        if created:
            admin.set_password(demo_password)
            admin.save(update_fields=["password"])

        admin_group, _ = Group.objects.get_or_create(name="ITSM_ADMIN")
        agent_group, _ = Group.objects.get_or_create(name="ITSM_AGENT")
        requester_group, _ = Group.objects.get_or_create(name="ITSM_REQUESTER")

        agents = []
        for i in range(1, 4):
            u, created = User.objects.get_or_create(
                username=f"agent{i}",
                defaults={"email": f"agent{i}@example.com", "is_staff": True},
            )
            if created:
                u.set_password(demo_password)
                u.save(update_fields=["password"])
            u.groups.add(agent_group)
            agents.append(u)

        requesters = []
        for i in range(1, 5):
            u, created = User.objects.get_or_create(
                username=f"user{i}",
                defaults={"email": f"user{i}@example.com", "is_staff": False},
            )
            if created:
                u.set_password(demo_password)
                u.save(update_fields=["password"])
            u.groups.add(requester_group)
            requesters.append(u)

        admin.groups.add(admin_group)
        admin.groups.add(agent_group)

        teams = []
        for name in ["Service Desk", "Network Ops", "Workplace IT"]:
            t, _ = Team.objects.get_or_create(name=name, defaults={"email": f"{name.replace(' ', '').lower()}@example.com"})
            teams.append(t)

        services = []
        for name, owner in [("VPN Gateway", teams[1]), ("Email", teams[0]), ("CRM System", teams[2])]:
            s, _ = Service.objects.get_or_create(name=name, defaults={"description": f"Service: {name}", "owner_team": owner})
            services.append(s)

        if ServiceRelationship.objects.count() == 0:
            ServiceRelationship.objects.create(rel_type=ServiceRelationship.Type.DEPENDS_ON, source_service=services[2], target_service=services[1])
            ServiceRelationship.objects.create(rel_type=ServiceRelationship.Type.DEPENDS_ON, source_service=services[1], target_service=services[0])

        for prio, mins in [(Ticket.Priority.P1, 240), (Ticket.Priority.P2, 480), (Ticket.Priority.P3, 960), (Ticket.Priority.P4, 1440)]:
            SlaPolicy.objects.get_or_create(
                kind=Ticket.Kind.INCIDENT,
                priority=prio,
                defaults={"resolution_minutes": mins, "at_risk_minutes": min(120, mins // 4), "is_active": True},
            )

        assets = []
        for i in range(1, assets_n + 1):
            tag = f"AST-{i:04d}"
            a, _ = Asset.objects.get_or_create(
                asset_tag=tag,
                defaults={
                    "name": _pick(["Dell Latitude", "MacBook Pro", "iPhone", "ThinkPad", "HP EliteBook"]) + f" #{i}",
                    "vendor": _pick(["Dell", "Apple", "Lenovo", "HP"]),
                    "model": _pick(["13\"", "14\"", "15\"", "Gen 4", "Gen 5"]),
                    "serial_number": f"SN-{i:06d}",
                    "status": Asset.Status.IN_STOCK if i % 2 == 0 else Asset.Status.IN_USE,
                    "owner": _pick(requesters) if i % 2 else None,
                    "location": _pick(["HQ", "Remote", "DC-1", "DC-2"]),
                    "purchase_date": (now - timedelta(days=400 + i)).date(),
                    "warranty_expires_on": (now + timedelta(days=10 + i)).date() if i % 3 == 0 else (now + timedelta(days=120 + i)).date(),
                },
            )
            assets.append(a)

        tpl, _ = BarcodeTemplate.objects.get_or_create(
            name="Default",
            defaults={"template": {"show_fields": ["asset_tag", "name", "owner", "location", "serial_number"]}, "created_by": admin, "is_active": True},
        )
        if not tpl.created_by_id:
            tpl.created_by = admin
            tpl.save(update_fields=["created_by"])

        for a in assets[: min(5, len(assets))]:
            if AssetTransaction.objects.filter(asset=a).count() == 0:
                AssetTransaction.objects.create(asset=a, action=AssetTransaction.Action.CHECK_OUT, performed_by=_pick(agents), notes="Issued to user")
                AssetTransaction.objects.create(asset=a, action=AssetTransaction.Action.CHECK_IN, performed_by=_pick(agents), notes="Returned to stock")

        catalog_items = []
        for name, cat, approval in [
            ("New Laptop Request", "Hardware", True),
            ("VPN Access", "Access", False),
            ("Software Installation", "Software", True),
            ("Email Alias Setup", "Email", False),
        ]:
            item, _ = CatalogItem.objects.get_or_create(
                name=name,
                category=cat,
                defaults={
                    "description": f"Catalog item: {name}",
                    "requires_approval": approval,
                    "fulfillment_instructions": "Demo fulfillment instructions.",
                    "is_active": True,
                },
            )
            catalog_items.append(item)

        tickets = []
        problem_tickets = []
        change_tickets = []
        service_request_tickets = []
        for i in range(tickets_n):
            requester = _pick(requesters)
            assignee = _pick(agents)
            team = _pick(teams)
            prio = _pick([Ticket.Priority.P1, Ticket.Priority.P2, Ticket.Priority.P3, Ticket.Priority.P4])
            status = _pick([Ticket.Status.NEW, Ticket.Status.IN_PROGRESS, Ticket.Status.ON_HOLD, Ticket.Status.RESOLVED])
            due = now + timedelta(hours=6 - i) if prio in (Ticket.Priority.P1, Ticket.Priority.P2) else now + timedelta(days=2 + i)
            kind = _pick([Ticket.Kind.INCIDENT, Ticket.Kind.SERVICE_REQUEST, Ticket.Kind.PROBLEM, Ticket.Kind.CHANGE])
            t = Ticket.objects.create(
                kind=kind,
                status=status,
                priority=prio,
                title=_pick(
                    [
                        "VPN access intermittent",
                        "Email delivery delayed",
                        "Laptop blue screen",
                        "CRM login failing",
                        "Wi-Fi outage on floor 2",
                        "Password reset not working",
                        "Request: New laptop",
                        "Request: Software install",
                        "Problem: Recurring VPN drops",
                        "Change: Firewall rule update",
                    ]
                ),
                description="Demo ticket seeded for feature validation.",
                category=_pick(["Network", "Access", "Hardware", "Software"]),
                subcategory=_pick(["VPN", "Email", "Laptop", "CRM", "Wi-Fi"]),
                impact=_pick([Ticket.Impact.HIGH, Ticket.Impact.MEDIUM, Ticket.Impact.LOW]),
                urgency=_pick([Ticket.Urgency.HIGH, Ticket.Urgency.MEDIUM, Ticket.Urgency.LOW]),
                change_type=_pick([Ticket.ChangeType.STANDARD, Ticket.ChangeType.NORMAL, Ticket.ChangeType.EMERGENCY]) if kind == Ticket.Kind.CHANGE else "",
                requester=requester,
                assignee=assignee,
                assignment_group=team,
                affected_service=_pick(services),
                due_at=due,
            )
            tickets.append(t)
            if kind == Ticket.Kind.PROBLEM:
                problem_tickets.append(t)
            elif kind == Ticket.Kind.CHANGE:
                change_tickets.append(t)
            elif kind == Ticket.Kind.SERVICE_REQUEST:
                service_request_tickets.append(t)
            TicketComment.objects.create(ticket=t, author=_pick(agents), body="Initial triage performed.")
            if i % 3 == 0:
                TicketApproval.objects.get_or_create(ticket=t, approver=admin, defaults={"status": TicketApproval.Status.PENDING, "comment": ""})

        for i in range(knowledge_n):
            status = KnowledgeArticle.Status.PUBLISHED if i % 2 == 0 else KnowledgeArticle.Status.DRAFT
            a = KnowledgeArticle.objects.create(
                title=_pick(["How to reset VPN client", "Email troubleshooting", "CRM access guide", "Laptop imaging checklist"]) + f" ({i+1})",
                body="Demo KB content.",
                category=_pick(["Network", "Email", "CRM", "Hardware"]),
                status=status,
                author=_pick(agents),
            )
            if status == KnowledgeArticle.Status.PUBLISHED:
                a.published_at = now - timedelta(days=10 - i)
                a.save(update_fields=["published_at"])

        published_articles = list(KnowledgeArticle.objects.filter(status=KnowledgeArticle.Status.PUBLISHED).order_by("-updated_at")[:5])
        for t in problem_tickets[: min(6, len(problem_tickets))]:
            KnownError.objects.get_or_create(
                problem_ticket=t,
                defaults={
                    "symptoms": "Recurring issue observed across multiple users.",
                    "workaround": "Restart VPN client and re-authenticate.",
                    "related_article": _pick(published_articles) if published_articles else None,
                },
            )

        if change_tickets:
            meeting, _ = CabMeeting.objects.get_or_create(
                title="Weekly CAB Meeting (Demo)",
                start_at=now + timedelta(days=1),
                end_at=now + timedelta(days=1, hours=1),
                defaults={"location": "Conference Room A", "notes": "Demo CAB notes."},
            )
            meeting.changes.add(*change_tickets[: min(5, len(change_tickets))])

        for t in service_request_tickets[: min(10, len(service_request_tickets))]:
            item = _pick(catalog_items)
            cr, _ = CatalogRequest.objects.get_or_create(
                ticket=t,
                defaults={
                    "item": item,
                    "requester": t.requester,
                    "status": CatalogRequest.Status.SUBMITTED,
                    "variables": {"justification": "Demo request", "requested_for": t.requester.username},
                },
            )
            if item.requires_approval and not cr.approved_by_id:
                cr.approved_by = admin
                cr.approved_at = now - timedelta(hours=2)
                cr.status = CatalogRequest.Status.APPROVED
                cr.save(update_fields=["approved_by", "approved_at", "status", "updated_at"])

        UserBadge.objects.get_or_create(user=agents[0], key="knowledge_contributor", defaults={"title": "Knowledge Contributor"})
        PointEvent.objects.create(user=agents[0], points=90, reason="SLA_RESOLVE", ticket=_pick(tickets))
        PointEvent.objects.create(user=agents[1], points=45, reason="KNOWLEDGE_PUBLISH", ticket=None)

        p1_ticket = next((t for t in tickets if t.priority == Ticket.Priority.P1), tickets[0])
        wr, _ = WarRoom.objects.get_or_create(ticket=p1_ticket, defaults={"created_by": agents[0], "is_active": True})
        WarRoomParticipant.objects.get_or_create(
            war_room=wr, user=agents[0], defaults={"role": WarRoomParticipant.Role.FACILITATOR}
        )
        WarRoomParticipant.objects.get_or_create(war_room=wr, user=agents[1], defaults={"role": WarRoomParticipant.Role.AGENT})
        if WarRoomMessage.objects.filter(war_room=wr).count() == 0:
            root = WarRoomMessage.objects.create(war_room=wr, author=agents[0], body="War room started. Assigning actions.")
            WarRoomMessage.objects.create(war_room=wr, author=agents[1], parent=root, body="Investigating VPN gateway logs.")
            WarRoomMessage.objects.create(war_room=wr, guest_name="Vendor Support", body="We see intermittent upstream latency.")

        TeamChallenge.objects.get_or_create(
            team=teams[0],
            kind=TeamChallenge.Kind.RESOLVE_SLA,
            title="Resolve 20 incidents within SLA",
            defaults={
                "description": "Weekly SLA sprint for Service Desk.",
                "goal": 20,
                "start_at": now - timedelta(days=2),
                "end_at": now + timedelta(days=5),
                "created_by": admin,
                "is_active": True,
            },
        )

        rd, _ = ReportDefinition.objects.get_or_create(
            name="Open P1/P2 Incidents",
            dataset=ReportDefinition.Dataset.TICKETS,
            defaults={
                "selected_fields": ["number", "priority", "status", "title", "assignee", "assignment_group", "due_at", "updated_at"],
                "conditions": {
                    "type": "group",
                    "op": "AND",
                    "children": [
                        {"type": "rule", "field": "kind", "op": "eq", "value": "INCIDENT"},
                        {"type": "rule", "field": "status", "op": "in", "value": "NEW,IN_PROGRESS,ON_HOLD"},
                        {"type": "rule", "field": "priority", "op": "in", "value": "P1,P2"},
                    ],
                },
                "created_by": admin,
                "is_public": True,
            },
        )
        if not rd.created_by_id:
            rd.created_by = admin
            rd.save(update_fields=["created_by"])

        ReportSchedule.objects.get_or_create(
            report=rd,
            frequency=ReportSchedule.Frequency.WEEKLY,
            format=ReportSchedule.Format.PDF,
            defaults={
                "recipients": ["admin@example.com"],
                "is_active": True,
                "next_run_at": now,
                "created_by": admin,
            },
        )

        wf, created = Workflow.objects.get_or_create(
            name="Incident Escalation Demo",
            kind=Workflow.Kind.INCIDENT_ESCALATION,
            defaults={"created_by": admin, "is_active": True},
        )
        if created:
            v1 = WorkflowVersion.objects.create(
                workflow=wf,
                version=1,
                status=WorkflowVersion.Status.DRAFT,
                schema={
                    "steps": [
                        {"type": "notify", "channel": "in_app", "target": "assignee", "message": "Escalation started for {{ticket_number}}"},
                        {"type": "if", "condition": {"field": "priority", "op": "eq", "value": "P1"}, "then": [{"type": "notify", "channel": "teams", "target": "assignee", "message": "P1 incident: {{ticket_number}} - {{ticket_title}}"}], "else": []},
                    ]
                },
                test_cases=[
                    {"input": {"ticket_id": str(p1_ticket.id)}, "expect": {"notifications": 1}},
                ],
                created_by=admin,
            )
            wf.deployed_version = v1
            wf.save(update_fields=["deployed_version", "updated_at"])
            v1.status = WorkflowVersion.Status.DEPLOYED
            v1.save(update_fields=["status"])

        hot_asset = assets[0]
        if AssetMetric.objects.filter(asset=hot_asset).count() == 0:
            for i in range(8):
                AssetMetric.objects.create(
                    asset=hot_asset,
                    captured_at=now - timedelta(minutes=35 - i * 5),
                    cpu_pct=30 + i * 3,
                    memory_pct=40 + i * 2,
                    temperature_c=60 + i,
                    data={"source": "seed"},
                )
            spike = AssetMetric.objects.create(
                asset=hot_asset,
                captured_at=now,
                cpu_pct=97,
                memory_pct=92,
                temperature_c=83,
                data={"source": "seed"},
            )
            AssetAlert.objects.get_or_create(
                asset=hot_asset,
                kind="CPU_ANOMALY",
                is_open=True,
                defaults={"severity": AssetAlert.Severity.CRITICAL, "message": f"CPU anomaly: {spike.cpu_pct:.0f}%"},
            )
            AssetRecommendation.objects.get_or_create(
                asset=hot_asset,
                kind="WARRANTY_EXPIRING",
                defaults={"message": "Warranty expiring soon. Plan replacement/renewal."},
            )

        TicketNumberConfig.objects.get_or_create(id=1, defaults={"prefix": "ITSM-", "padding": 6})
        SystemSetting.objects.get_or_create(key="notifications", defaults={"value": {"teams_webhook_url": "", "slack_webhook_url": ""}, "updated_by": admin})
        SystemSetting.objects.get_or_create(key="ai_agents", defaults={"value": {"enabled": True, "max_results": 5}, "updated_by": admin})
        SystemSetting.objects.get_or_create(key="gamification", defaults={"value": {"points_sla_p1": 50, "points_sla_p2": 30, "points_sla_p3": 20, "points_sla_p4": 15}, "updated_by": admin})

        ns_roles, _ = ConfigNamespace.objects.get_or_create(
            key="roles",
            defaults={"name": "Roles", "description": "UI labels/descriptions for RBAC roles.", "is_active": True, "updated_by": admin},
        )
        for key, label, desc, order in [
            ("ITSM_ADMIN", "Privileged Admin", "Manage access, configuration, and master data.", 10),
            ("ITSM_AGENT", "Agent", "Handle operational ITSM work (tickets, approvals, fulfillment).", 20),
            ("ITSM_REQUESTER", "Requester", "Create and track own incidents/requests and use portal.", 30),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_roles,
                key=key,
                defaults={"label": label, "description": desc, "value": {}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_categories, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_categories",
            defaults={"name": "Ticket Categories", "description": "Categories available during ticket creation.", "is_active": True, "updated_by": admin},
        )
        for key, label, order in [
            ("NETWORK", "Network", 10),
            ("EMAIL", "Email", 20),
            ("HARDWARE", "Hardware", 30),
            ("SOFTWARE", "Software", 40),
            ("ACCESS", "Access", 50),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_categories,
                key=key,
                defaults={"label": label, "description": "", "value": {}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_subcategories, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_subcategories",
            defaults={"name": "Ticket Subcategories", "description": "Subcategories available during ticket creation.", "is_active": True, "updated_by": admin},
        )
        for key, label, order, value in [
            ("VPN", "VPN", 10, {"category_key": "NETWORK"}),
            ("WIFI", "Wi‑Fi", 20, {"category_key": "NETWORK"}),
            ("ROUTER", "Router", 30, {"category_key": "NETWORK"}),
            ("PASSWORD", "Password Reset", 40, {"category_key": "ACCESS"}),
            ("ACCOUNT", "Account Issue", 50, {"category_key": "ACCESS"}),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_subcategories,
                key=key,
                defaults={"label": label, "description": "", "value": value, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_ai, _ = ConfigNamespace.objects.get_or_create(
            key="ai_routing_rules",
            defaults={"name": "AI Routing Rules", "description": "Keyword-based assignment suggestions.", "is_active": True, "updated_by": admin},
        )
        for key, label, keyword, team_name, order in [
            ("VPN", "VPN → Network", "vpn", "Network", 10),
            ("WIFI", "Wi‑Fi → Network", "wifi", "Network", 20),
            ("EMAIL", "Email → Service Desk", "email", "Service Desk", 30),
            ("PASSWORD", "Password → Service Desk", "password", "Service Desk", 40),
            ("ACCOUNT", "Account → Service Desk", "account", "Service Desk", 50),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_ai,
                key=key,
                defaults={"label": label, "description": "", "value": {"keyword": keyword, "team_name": team_name}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_ach, _ = ConfigNamespace.objects.get_or_create(
            key="achievements",
            defaults={"name": "Achievements", "description": "Gamification achievements configuration.", "is_active": True, "updated_by": admin},
        )
        for key, title, desc, metric, goal, order in [
            ("first_responder", "First Responder", "Resolve your first ticket within SLA.", "sla_resolves", 1, 10),
            ("sla_hero", "SLA Hero", "Resolve 10 tickets within SLA.", "sla_resolves", 10, 20),
            ("knowledge_contributor", "Knowledge Contributor", "Publish your first knowledge article.", "knowledge_published", 1, 30),
            ("knowledge_champion", "Knowledge Champion", "Publish 5 knowledge articles.", "knowledge_published", 5, 40),
            ("war_room_leader", "War Room Leader", "Post 10 messages in war rooms.", "war_room_messages", 10, 50),
            ("workflow_master", "Workflow Master", "Deploy your first workflow version.", "workflow_deploys", 1, 60),
            ("all_rounder", "All-rounder", "Earn 200 total points.", "total_points", 200, 70),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_ach,
                key=key,
                defaults={
                    "label": title,
                    "description": desc,
                    "value": {"metric": metric, "goal": goal},
                    "sort_order": order,
                    "is_active": True,
                    "updated_by": admin,
                },
            )

        ns_status, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_statuses",
            defaults={"name": "Ticket Statuses", "description": "UI labels and badge tones for ticket status.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("NEW", "New", "info", 10),
            ("IN_PROGRESS", "In Progress", "warning", 20),
            ("ON_HOLD", "On Hold", "info", 30),
            ("RESOLVED", "Resolved", "success", 40),
            ("CLOSED", "Closed", "success", 50),
            ("CANCELED", "Canceled", "neutral", 60),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_status,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_priority, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_priorities",
            defaults={"name": "Ticket Priorities", "description": "UI labels and badge tones for ticket priority.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("P1", "P1 - Critical", "danger", 10),
            ("P2", "P2 - High", "warning", 20),
            ("P3", "P3 - Medium", "info", 30),
            ("P4", "P4 - Low", "success", 40),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_priority,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_impact, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_impacts",
            defaults={"name": "Ticket Impacts", "description": "UI labels and badge tones for impact.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("LOW", "Low", "success", 10),
            ("MEDIUM", "Medium", "warning", 20),
            ("HIGH", "High", "danger", 30),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_impact,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_urgency, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_urgencies",
            defaults={"name": "Ticket Urgencies", "description": "UI labels and badge tones for urgency.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("LOW", "Low", "success", 10),
            ("MEDIUM", "Medium", "warning", 20),
            ("HIGH", "High", "danger", 30),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_urgency,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_change_type, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_change_types",
            defaults={"name": "Change Types", "description": "UI labels and badge tones for change type.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("STANDARD", "Standard", "neutral", 10),
            ("NORMAL", "Normal", "info", 20),
            ("EMERGENCY", "Emergency", "danger", 30),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_change_type,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_sla_status, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_sla_statuses",
            defaults={"name": "SLA Status", "description": "UI labels and badge tones for SLA status.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("ON_TRACK", "On Track", "success", 10),
            ("AT_RISK", "At Risk", "warning", 20),
            ("BREACHED", "Breached", "danger", 30),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_sla_status,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_kind, _ = ConfigNamespace.objects.get_or_create(
            key="ticket_kinds",
            defaults={"name": "Ticket Kinds", "description": "UI labels for ticket kind values.", "is_active": True, "updated_by": admin},
        )
        for key, label, order in [
            ("INCIDENT", "Incident", 10),
            ("SERVICE_REQUEST", "Service Request", 20),
            ("PROBLEM", "Problem", 30),
            ("CHANGE", "Change", 40),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_kind,
                key=key,
                defaults={"label": label, "description": "", "value": {}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        ns_cat_req, _ = ConfigNamespace.objects.get_or_create(
            key="catalog_request_statuses",
            defaults={"name": "Catalog Request Statuses", "description": "UI labels and badge tones for catalog requests.", "is_active": True, "updated_by": admin},
        )
        for key, label, tone, order in [
            ("SUBMITTED", "Submitted", "info", 10),
            ("APPROVED", "Approved", "success", 20),
            ("REJECTED", "Rejected", "danger", 30),
            ("FULFILLING", "Fulfilling", "warning", 40),
            ("COMPLETED", "Completed", "success", 50),
            ("CANCELED", "Canceled", "neutral", 60),
        ]:
            ConfigEntry.objects.get_or_create(
                namespace=ns_cat_req,
                key=key,
                defaults={"label": label, "description": "", "value": {"tone": tone}, "sort_order": order, "is_active": True, "updated_by": admin},
            )

        rewards = []
        for name, cost in [("Coffee Voucher", 100), ("Swag Pack", 250), ("Extra PTO Hour", 500)]:
            r, _ = Reward.objects.get_or_create(name=name, defaults={"description": f"Reward: {name}", "cost_points": cost, "is_active": True, "stock": 20})
            rewards.append(r)
        if rewards and RewardRedemption.objects.count() == 0:
            RewardRedemption.objects.create(reward=rewards[0], user=agents[0], cost_points=rewards[0].cost_points, status=RewardRedemption.Status.FULFILLED, decided_at=now)

        self.stdout.write(self.style.SUCCESS("Demo data seeded."))
        self.stdout.write(self.style.SUCCESS(f"Login: admin / {demo_password} (set DEMO_PASSWORD to override)"))
