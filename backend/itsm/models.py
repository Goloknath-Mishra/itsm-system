from __future__ import annotations

"""Domain models for the ITSM system.

This module defines the core database entities that back the UI and API:
- Ticketing (incidents/requests/problems/changes) and SLA fields
- CMDB (services + relationships) and IT assets
- Knowledge base, workflows, reports, notifications, gamification
"""

import uuid

from django.conf import settings
from django.db import models
from django.db import transaction


class Team(models.Model):
    """Assignment group / team used for ownership and routing."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, unique=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.name


class Ticket(models.Model):
    """Single record type representing Incidents, Requests, Problems, and Changes."""

    class Kind(models.TextChoices):
        INCIDENT = "INCIDENT", "Incident"
        SERVICE_REQUEST = "SERVICE_REQUEST", "Service Request"
        PROBLEM = "PROBLEM", "Problem"
        CHANGE = "CHANGE", "Change"

    class Status(models.TextChoices):
        NEW = "NEW", "New"
        IN_PROGRESS = "IN_PROGRESS", "In Progress"
        ON_HOLD = "ON_HOLD", "On Hold"
        RESOLVED = "RESOLVED", "Resolved"
        CLOSED = "CLOSED", "Closed"
        CANCELED = "CANCELED", "Canceled"

    class Priority(models.TextChoices):
        P1 = "P1", "P1 - Critical"
        P2 = "P2", "P2 - High"
        P3 = "P3", "P3 - Medium"
        P4 = "P4", "P4 - Low"

    class Impact(models.TextChoices):
        HIGH = "HIGH", "High"
        MEDIUM = "MEDIUM", "Medium"
        LOW = "LOW", "Low"

    class Urgency(models.TextChoices):
        HIGH = "HIGH", "High"
        MEDIUM = "MEDIUM", "Medium"
        LOW = "LOW", "Low"

    class ChangeType(models.TextChoices):
        STANDARD = "STANDARD", "Standard"
        NORMAL = "NORMAL", "Normal"
        EMERGENCY = "EMERGENCY", "Emergency"

    class SlaStatus(models.TextChoices):
        ON_TRACK = "ON_TRACK", "On Track"
        AT_RISK = "AT_RISK", "At Risk"
        BREACHED = "BREACHED", "Breached"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    number = models.CharField(max_length=32, unique=True, editable=False)

    kind = models.CharField(max_length=32, choices=Kind.choices, default=Kind.INCIDENT)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.NEW)
    priority = models.CharField(max_length=2, choices=Priority.choices, default=Priority.P3)

    title = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    resolution_summary = models.TextField(blank=True)

    category = models.CharField(max_length=120, blank=True)
    subcategory = models.CharField(max_length=120, blank=True)
    impact = models.CharField(max_length=10, choices=Impact.choices, default=Impact.MEDIUM)
    urgency = models.CharField(max_length=10, choices=Urgency.choices, default=Urgency.MEDIUM)
    change_type = models.CharField(max_length=16, choices=ChangeType.choices, blank=True)

    requester = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="requested_tickets"
    )
    assignee = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="assigned_tickets",
        null=True,
        blank=True,
    )
    assignment_group = models.ForeignKey(
        Team, on_delete=models.PROTECT, related_name="tickets", null=True, blank=True
    )

    affected_service = models.ForeignKey(
        "Service", on_delete=models.PROTECT, null=True, blank=True, related_name="tickets"
    )

    due_at = models.DateTimeField(null=True, blank=True)
    sla_status = models.CharField(max_length=16, choices=SlaStatus.choices, default=SlaStatus.ON_TRACK)
    breached_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.number} - {self.title}"

    def save(self, *args, **kwargs) -> None:
        """Assign the next ticket number on first save."""
        if not self.number:
            self.number = TicketNumberSequence.next_ticket_number()
        super().save(*args, **kwargs)


class TicketNumberSequence(models.Model):
    """Monotonic sequence used to generate user-facing ticket numbers."""

    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    next_value = models.PositiveIntegerField(default=1)

    @classmethod
    def next_ticket_number(cls) -> str:
        """Generate the next ticket number using the configured prefix and padding."""
        with transaction.atomic():
            obj, _ = cls.objects.select_for_update().get_or_create(
                id=1, defaults={"next_value": 1}
            )
            value = obj.next_value
            obj.next_value = value + 1
            obj.save(update_fields=["next_value"])
            cfg, _ = TicketNumberConfig.objects.get_or_create(id=1, defaults={"prefix": "ITSM-", "padding": 6})
            padding = max(1, min(int(cfg.padding or 6), 12))
            prefix = cfg.prefix or "ITSM-"
            return f"{prefix}{value:0{padding}d}"


class TicketNumberConfig(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    prefix = models.CharField(max_length=32, default="ITSM-")
    padding = models.PositiveSmallIntegerField(default=6)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.prefix} (pad {self.padding})"


class TicketComment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="comments")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"Comment on {self.ticket.number}"


class TicketApproval(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="approvals")
    approver = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    comment = models.TextField(blank=True)

    requested_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["ticket", "approver"], name="unique_approval_per_ticket")
        ]

    def __str__(self) -> str:
        return f"{self.ticket.number} - {self.approver}"


class KnowledgeArticle(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=300)
    body = models.TextField()
    category = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return self.title


class Asset(models.Model):
    class Status(models.TextChoices):
        IN_STOCK = "IN_STOCK", "In Stock"
        IN_USE = "IN_USE", "In Use"
        UNDER_REPAIR = "UNDER_REPAIR", "Under Repair"
        RETIRED = "RETIRED", "Retired"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset_tag = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=300)
    description = models.TextField(blank=True)
    serial_number = models.CharField(max_length=128, blank=True)
    vendor = models.CharField(max_length=200, blank=True)
    model = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.IN_STOCK)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="assets"
    )
    location = models.CharField(max_length=200, blank=True)
    purchase_date = models.DateField(null=True, blank=True)
    warranty_expires_on = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.asset_tag} - {self.name}"


class UserPreference(models.Model):
    class Theme(models.TextChoices):
        DARK = "dark", "Dark"
        LIGHT = "light", "Light"

    class Density(models.TextChoices):
        COMFORTABLE = "comfortable", "Comfortable"
        COMPACT = "compact", "Compact"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="itsm_preferences")
    theme = models.CharField(max_length=16, choices=Theme.choices, default=Theme.DARK)
    accent = models.CharField(max_length=32, default="cyan")
    density = models.CharField(max_length=16, choices=Density.choices, default=Density.COMFORTABLE)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"Preferences({self.user})"


class DynamicForm(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        PUBLISHED = "PUBLISHED", "Published"

    class RecordType(models.TextChoices):
        INCIDENT = "INCIDENT", "Incident"
        SERVICE_REQUEST = "SERVICE_REQUEST", "Service Request"
        PROBLEM = "PROBLEM", "Problem"
        CHANGE = "CHANGE", "Change"
        ASSET = "ASSET", "Asset"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    record_type = models.CharField(max_length=32, choices=RecordType.choices, default=RecordType.INCIDENT)
    version = models.PositiveIntegerField(default=1)
    schema = models.JSONField(default=dict)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_forms"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="updated_forms"
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class KnowledgeFeedback(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(KnowledgeArticle, on_delete=models.CASCADE, related_name="feedback")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="knowledge_feedback")
    rating = models.PositiveSmallIntegerField()
    helpful = models.BooleanField(default=True)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["article", "user"], name="unique_feedback_per_article_user")
        ]

    def __str__(self) -> str:
        return f"Feedback({self.article_id}, {self.user_id})"


class Notification(models.Model):
    class Kind(models.TextChoices):
        SLA = "SLA", "SLA"
        APPROVAL = "APPROVAL", "Approval"
        INFO = "INFO", "Info"
        AI = "AI", "AI"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.INFO)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.kind}: {self.title}"


class SlaPolicy(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=32, choices=Ticket.Kind.choices)
    priority = models.CharField(max_length=2, choices=Ticket.Priority.choices)
    resolution_minutes = models.PositiveIntegerField(default=480)
    at_risk_minutes = models.PositiveIntegerField(default=60)
    is_active = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["kind", "priority"], name="unique_sla_policy_kind_priority")
        ]

    def __str__(self) -> str:
        return f"SLA({self.kind} {self.priority})"


class CatalogItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    category = models.CharField(max_length=120, blank=True)
    is_active = models.BooleanField(default=True)
    requires_approval = models.BooleanField(default=False)
    fulfillment_instructions = models.TextField(blank=True)
    form = models.ForeignKey(DynamicForm, on_delete=models.PROTECT, null=True, blank=True, related_name="catalog_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class CatalogRequest(models.Model):
    class Status(models.TextChoices):
        SUBMITTED = "SUBMITTED", "Submitted"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        FULFILLING = "FULFILLING", "Fulfilling"
        COMPLETED = "COMPLETED", "Completed"
        CANCELED = "CANCELED", "Canceled"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    item = models.ForeignKey(CatalogItem, on_delete=models.PROTECT, related_name="requests")
    requester = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="catalog_requests")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.SUBMITTED)
    variables = models.JSONField(default=dict)
    ticket = models.OneToOneField(Ticket, on_delete=models.SET_NULL, null=True, blank=True, related_name="catalog_request")

    approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, null=True, blank=True, related_name="approved_catalog_requests"
    )
    approved_at = models.DateTimeField(null=True, blank=True)

    requested_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.item.name} ({self.requester})"


class Service(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200, unique=True)
    description = models.TextField(blank=True)
    owner_team = models.ForeignKey(Team, on_delete=models.PROTECT, null=True, blank=True, related_name="services")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class ServiceRelationship(models.Model):
    class Type(models.TextChoices):
        DEPENDS_ON = "DEPENDS_ON", "Depends On"
        RUNS_ON = "RUNS_ON", "Runs On"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    rel_type = models.CharField(max_length=16, choices=Type.choices, default=Type.DEPENDS_ON)
    source_service = models.ForeignKey(Service, on_delete=models.CASCADE, related_name="outgoing_relationships")
    target_service = models.ForeignKey(Service, on_delete=models.CASCADE, null=True, blank=True, related_name="incoming_relationships")
    target_asset = models.ForeignKey(Asset, on_delete=models.CASCADE, null=True, blank=True, related_name="service_relationships")

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=models.Q(target_service__isnull=False) | models.Q(target_asset__isnull=False),
                name="service_relationship_requires_target",
            )
        ]

    def __str__(self) -> str:
        return f"{self.source_service} -> {self.target_service or self.target_asset}"


class KnownError(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    problem_ticket = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name="known_error")
    symptoms = models.TextField(blank=True)
    workaround = models.TextField(blank=True)
    related_article = models.ForeignKey(KnowledgeArticle, on_delete=models.PROTECT, null=True, blank=True, related_name="known_errors")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"KnownError({self.problem_ticket.number})"


class CabMeeting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    location = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    changes = models.ManyToManyField(Ticket, related_name="cab_meetings", blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.title


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action = models.CharField(max_length=80)
    object_type = models.CharField(max_length=80)
    object_id = models.UUIDField(null=True, blank=True)
    summary = models.CharField(max_length=240, blank=True)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.action} {self.object_type}"


class WarRoom(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.OneToOneField(Ticket, on_delete=models.CASCADE, related_name="war_room")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_war_rooms")
    is_active = models.BooleanField(default=True)
    guest_token = models.UUIDField(default=uuid.uuid4, editable=False)
    slack_webhook_url = models.CharField(max_length=500, blank=True)
    teams_webhook_url = models.CharField(max_length=500, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"WarRoom({self.ticket.number})"


class WarRoomParticipant(models.Model):
    class Role(models.TextChoices):
        FACILITATOR = "FACILITATOR", "Facilitator"
        AGENT = "AGENT", "Agent"
        OBSERVER = "OBSERVER", "Observer"
        GUEST = "GUEST", "Guest"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    war_room = models.ForeignKey(WarRoom, on_delete=models.CASCADE, related_name="participants")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True)
    guest_name = models.CharField(max_length=120, blank=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.AGENT)
    joined_at = models.DateTimeField(auto_now_add=True)
    left_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["war_room", "user"], name="unique_war_room_participant_user")
        ]

    def __str__(self) -> str:
        return f"{self.war_room_id} ({self.user_id or self.guest_name})"


class WarRoomMessage(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    war_room = models.ForeignKey(WarRoom, on_delete=models.CASCADE, related_name="messages")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    guest_name = models.CharField(max_length=120, blank=True)
    parent = models.ForeignKey("self", on_delete=models.CASCADE, null=True, blank=True, related_name="replies")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"WarRoomMessage({self.war_room_id})"


class PointEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="points")
    ticket = models.ForeignKey(Ticket, on_delete=models.SET_NULL, null=True, blank=True, related_name="point_events")
    points = models.IntegerField(default=0)
    reason = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.user_id} {self.points}"


class UserBadge(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="badges")
    key = models.CharField(max_length=80)
    title = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["user", "key"], name="unique_badge_per_user")]

    def __str__(self) -> str:
        return f"{self.user_id} {self.key}"


class TeamChallenge(models.Model):
    class Kind(models.TextChoices):
        RESOLVE_SLA = "RESOLVE_SLA", "Resolve within SLA"
        KNOWLEDGE = "KNOWLEDGE", "Knowledge contributions"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name="challenges")
    kind = models.CharField(max_length=24, choices=Kind.choices, default=Kind.RESOLVE_SLA)
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    goal = models.PositiveIntegerField(default=20)
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_challenges")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.title


class ReportDefinition(models.Model):
    class Dataset(models.TextChoices):
        TICKETS = "TICKETS", "Tickets"
        ASSETS = "ASSETS", "Assets"
        KNOWLEDGE = "KNOWLEDGE", "Knowledge"
        CATALOG_REQUESTS = "CATALOG_REQUESTS", "Catalog Requests"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    dataset = models.CharField(max_length=32, choices=Dataset.choices, default=Dataset.TICKETS)
    selected_fields = models.JSONField(default=list)
    conditions = models.JSONField(default=dict)
    is_public = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_reports")
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name


class ReportSchedule(models.Model):
    class Frequency(models.TextChoices):
        DAILY = "DAILY", "Daily"
        WEEKLY = "WEEKLY", "Weekly"
        MONTHLY = "MONTHLY", "Monthly"

    class Format(models.TextChoices):
        CSV = "CSV", "CSV"
        PDF = "PDF", "PDF"
        XLSX = "XLSX", "Excel"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    report = models.ForeignKey(ReportDefinition, on_delete=models.CASCADE, related_name="schedules")
    frequency = models.CharField(max_length=16, choices=Frequency.choices, default=Frequency.WEEKLY)
    format = models.CharField(max_length=8, choices=Format.choices, default=Format.PDF)
    recipients = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    next_run_at = models.DateTimeField(null=True, blank=True)
    last_run_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_report_schedules")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.report.name} ({self.frequency})"


class BarcodeTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=160, unique=True)
    template = models.JSONField(default=dict)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="barcode_templates")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class AssetTransaction(models.Model):
    class Action(models.TextChoices):
        CHECK_OUT = "CHECK_OUT", "Check-out"
        CHECK_IN = "CHECK_IN", "Check-in"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="transactions")
    action = models.CharField(max_length=16, choices=Action.choices)
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="asset_transactions")
    notes = models.TextField(blank=True)
    performed_at = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return f"{self.asset.asset_tag} {self.action}"


class AssetMetric(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="metrics")
    captured_at = models.DateTimeField()
    cpu_pct = models.FloatField(null=True, blank=True)
    memory_pct = models.FloatField(null=True, blank=True)
    temperature_c = models.FloatField(null=True, blank=True)
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [models.Index(fields=["asset", "-captured_at"])]

    def __str__(self) -> str:
        return f"{self.asset.asset_tag} {self.captured_at}"


class AssetAlert(models.Model):
    class Severity(models.TextChoices):
        INFO = "INFO", "Info"
        WARNING = "WARNING", "Warning"
        CRITICAL = "CRITICAL", "Critical"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="alerts")
    kind = models.CharField(max_length=80)
    severity = models.CharField(max_length=16, choices=Severity.choices, default=Severity.WARNING)
    message = models.CharField(max_length=300)
    is_open = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.asset.asset_tag} {self.kind}"


class AssetRecommendation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name="recommendations")
    kind = models.CharField(max_length=80)
    message = models.CharField(max_length=400)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["asset", "kind"], name="unique_recommendation_kind_per_asset")
        ]

    def __str__(self) -> str:
        return f"{self.asset.asset_tag} {self.kind}"


class Workflow(models.Model):
    class Kind(models.TextChoices):
        INCIDENT_ESCALATION = "INCIDENT_ESCALATION", "Incident Escalation"
        SLA_ESCALATION = "SLA_ESCALATION", "SLA Escalation"
        CATALOG_FULFILLMENT = "CATALOG_FULFILLMENT", "Catalog Fulfillment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    kind = models.CharField(max_length=32, choices=Kind.choices, default=Kind.INCIDENT_ESCALATION)
    is_active = models.BooleanField(default=True)
    deployed_version = models.ForeignKey(
        "WorkflowVersion", on_delete=models.SET_NULL, null=True, blank=True, related_name="deployed_for"
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="created_workflows")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class WorkflowVersion(models.Model):
    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        DEPLOYED = "DEPLOYED", "Deployed"
        ARCHIVED = "ARCHIVED", "Archived"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow = models.ForeignKey(Workflow, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    schema = models.JSONField(default=dict)
    test_cases = models.JSONField(default=list)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="workflow_versions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["workflow", "version"], name="unique_workflow_version")]

    def __str__(self) -> str:
        return f"{self.workflow.name} v{self.version}"


class WorkflowRun(models.Model):
    class Status(models.TextChoices):
        RUNNING = "RUNNING", "Running"
        SUCCEEDED = "SUCCEEDED", "Succeeded"
        FAILED = "FAILED", "Failed"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workflow_version = models.ForeignKey(WorkflowVersion, on_delete=models.CASCADE, related_name="runs")
    sandbox = models.BooleanField(default=True)
    input = models.JSONField(default=dict)
    output = models.JSONField(default=dict)
    logs = models.JSONField(default=list)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.RUNNING)
    error = models.TextField(blank=True)
    started_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.workflow_version} {self.status}"


class ConfigNamespace(models.Model):
    """Configuration namespace grouping related master data entries.

    Examples:
    - ticket_categories
    - ticket_subcategories
    - ai_routing_rules
    - roles (labels/descriptions for fixed RBAC groups)
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=80, unique=True)
    name = models.CharField(max_length=160)
    description = models.CharField(max_length=500, blank=True)
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.key


class ConfigEntry(models.Model):
    """Entry inside a configuration namespace.

    Value is stored as JSON so a single table can support different configuration types.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    namespace = models.ForeignKey(ConfigNamespace, on_delete=models.CASCADE, related_name="entries")
    key = models.CharField(max_length=120)
    label = models.CharField(max_length=200)
    description = models.CharField(max_length=500, blank=True)
    value = models.JSONField(default=dict)
    sort_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["namespace", "key"], name="unique_config_entry")]

    def __str__(self) -> str:
        return f"{self.namespace.key}:{self.key}"


class SystemSetting(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    key = models.CharField(max_length=80, unique=True)
    value = models.JSONField(default=dict)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.key


class Reward(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    cost_points = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    stock = models.PositiveIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return self.name


class RewardRedemption(models.Model):
    class Status(models.TextChoices):
        REQUESTED = "REQUESTED", "Requested"
        APPROVED = "APPROVED", "Approved"
        FULFILLED = "FULFILLED", "Fulfilled"
        REJECTED = "REJECTED", "Rejected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    reward = models.ForeignKey(Reward, on_delete=models.PROTECT, related_name="redemptions")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="reward_redemptions")
    cost_points = models.PositiveIntegerField()
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.REQUESTED)
    created_at = models.DateTimeField(auto_now_add=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"{self.user_id} {self.reward.name} {self.status}"
