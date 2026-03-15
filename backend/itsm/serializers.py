from __future__ import annotations

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from itsm.models import (
    Asset,
    AssetTransaction,
    AssetMetric,
    AssetAlert,
    AssetRecommendation,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
    AuditEvent,
    BarcodeTemplate,
    CabMeeting,
    CatalogItem,
    CatalogRequest,
    DynamicForm,
    KnowledgeArticle,
    KnowledgeFeedback,
    KnownError,
    Notification,
    Service,
    ServiceRelationship,
    SlaPolicy,
    WarRoom,
    WarRoomMessage,
    WarRoomParticipant,
    PointEvent,
    ReportDefinition,
    ReportSchedule,
    Reward,
    RewardRedemption,
    ConfigNamespace,
    ConfigEntry,
    SystemSetting,
    TeamChallenge,
    TicketNumberConfig,
    UserBadge,
    Team,
    Ticket,
    TicketApproval,
    TicketComment,
    UserPreference,
)

User = get_user_model()


class UserSummarySerializer(serializers.ModelSerializer):
    """Compact user representation returned in many endpoints (includes RBAC roles)."""

    roles = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "is_staff", "is_superuser", "roles")

    def get_roles(self, obj):
        """Expose ITSM_* Django groups for UI RBAC."""
        try:
            names = list(obj.groups.values_list("name", flat=True))
        except Exception:
            names = []
        roles = [n for n in names if n.startswith("ITSM_")]
        roles.sort()
        return roles


class AdminUserSerializer(serializers.ModelSerializer):
    """Privileged serializer to manage user access (RBAC group assignment)."""

    roles = serializers.ListField(child=serializers.CharField(), required=False)

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "is_staff", "is_superuser", "roles")
        read_only_fields = ("id", "username")

    def to_representation(self, instance):
        """Return user fields plus current ITSM_* group membership."""
        data = super().to_representation(instance)
        try:
            roles = list(instance.groups.values_list("name", flat=True))
        except Exception:
            roles = []
        data["roles"] = sorted([r for r in roles if r.startswith("ITSM_")])
        return data

    def validate_roles(self, value):
        """Validate and normalize requested role names (only ITSM_* allowed)."""
        if not isinstance(value, list):
            raise ValidationError("roles must be a list")
        cleaned = []
        for r in value:
            if not isinstance(r, str):
                continue
            r = r.strip()
            if r.startswith("ITSM_"):
                cleaned.append(r)
        return sorted(set(cleaned))

    def update(self, instance, validated_data):
        """Update user flags and group membership in a single request."""
        roles = validated_data.pop("roles", None)
        for k, v in validated_data.items():
            setattr(instance, k, v)
        instance.save()

        if roles is not None:
            groups = list(Group.objects.filter(name__in=roles))
            instance.groups.set(groups)
        return instance


class TeamSerializer(serializers.ModelSerializer):
    class Meta:
        model = Team
        fields = ("id", "name", "email", "is_active")


class ServiceSerializer(serializers.ModelSerializer):
    owner_team = TeamSerializer(read_only=True)
    owner_team_id = serializers.PrimaryKeyRelatedField(
        source="owner_team", queryset=Team.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Service
        fields = ("id", "name", "description", "owner_team", "owner_team_id", "is_active", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ServiceRelationshipSerializer(serializers.ModelSerializer):
    source_service = ServiceSerializer(read_only=True)
    target_service = ServiceSerializer(read_only=True)
    target_asset = serializers.SerializerMethodField()

    source_service_id = serializers.PrimaryKeyRelatedField(source="source_service", queryset=Service.objects.all(), write_only=True)
    target_service_id = serializers.PrimaryKeyRelatedField(
        source="target_service", queryset=Service.objects.all(), write_only=True, required=False, allow_null=True
    )
    target_asset_id = serializers.PrimaryKeyRelatedField(
        source="target_asset", queryset=Asset.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = ServiceRelationship
        fields = (
            "id",
            "rel_type",
            "source_service",
            "target_service",
            "target_asset",
            "source_service_id",
            "target_service_id",
            "target_asset_id",
        )
        read_only_fields = ("id", "source_service", "target_service", "target_asset")

    def get_target_asset(self, obj):
        if not obj.target_asset_id:
            return None
        return {"id": str(obj.target_asset_id), "asset_tag": obj.target_asset.asset_tag, "name": obj.target_asset.name}


class TicketCommentSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)

    class Meta:
        model = TicketComment
        fields = ("id", "ticket", "author", "body", "created_at")
        read_only_fields = ("id", "author", "created_at")


class TicketCommentCreateSerializer(serializers.Serializer):
    body = serializers.CharField()


class TicketApprovalSerializer(serializers.ModelSerializer):
    approver = UserSummarySerializer(read_only=True)

    class Meta:
        model = TicketApproval
        fields = (
            "id",
            "ticket",
            "approver",
            "status",
            "comment",
            "requested_at",
            "responded_at",
        )
        read_only_fields = ("id", "requested_at", "responded_at")


class TicketApprovalInputSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=TicketApproval.Status.choices)
    comment = serializers.CharField(required=False, allow_blank=True)


class TicketSerializer(serializers.ModelSerializer):
    requester = UserSummarySerializer(read_only=True)
    assignee = UserSummarySerializer(read_only=True)
    assignment_group = TeamSerializer(read_only=True)
    affected_service = ServiceSerializer(read_only=True)
    comments = TicketCommentSerializer(many=True, read_only=True)
    approvals = TicketApprovalSerializer(many=True, read_only=True)
    sla_remaining_minutes = serializers.SerializerMethodField()

    assignee_id = serializers.PrimaryKeyRelatedField(
        source="assignee", queryset=User.objects.all(), write_only=True, required=False, allow_null=True
    )
    assignment_group_id = serializers.PrimaryKeyRelatedField(
        source="assignment_group",
        queryset=Team.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )
    affected_service_id = serializers.PrimaryKeyRelatedField(
        source="affected_service", queryset=Service.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Ticket
        fields = (
            "id",
            "number",
            "kind",
            "status",
            "priority",
            "impact",
            "urgency",
            "category",
            "subcategory",
            "change_type",
            "title",
            "description",
            "resolution_summary",
            "requester",
            "assignee",
            "assignment_group",
            "affected_service",
            "assignee_id",
            "assignment_group_id",
            "affected_service_id",
            "due_at",
            "sla_status",
            "breached_at",
            "sla_remaining_minutes",
            "closed_at",
            "created_at",
            "updated_at",
            "comments",
            "approvals",
        )
        read_only_fields = ("id", "number", "requester", "created_at", "updated_at")

    def get_sla_remaining_minutes(self, obj):
        if not obj.due_at:
            return None
        remaining = int((obj.due_at - timezone.now()).total_seconds() // 60)
        return remaining

    def validate(self, attrs):
        request = self.context.get("request")
        if not request or not request.user or not request.user.is_authenticated:
            return attrs

        if self.instance is None:
            return attrs

        if request.user.is_staff:
            return attrs

        allowed = {"title", "description"}
        illegal = [k for k in attrs.keys() if k not in allowed]
        if illegal:
            raise ValidationError("Requesters can only update title and description.")
        return attrs


class KnowledgeArticleSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)
    rating_avg = serializers.FloatField(read_only=True)
    rating_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = KnowledgeArticle
        fields = (
            "id",
            "title",
            "body",
            "category",
            "status",
            "author",
            "rating_avg",
            "rating_count",
            "created_at",
            "updated_at",
            "published_at",
        )
        read_only_fields = ("id", "author", "created_at", "updated_at")


class AssetSerializer(serializers.ModelSerializer):
    owner = UserSummarySerializer(read_only=True)
    owner_id = serializers.PrimaryKeyRelatedField(
        source="owner", queryset=User.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = Asset
        fields = (
            "id",
            "asset_tag",
            "name",
            "description",
            "serial_number",
            "vendor",
            "model",
            "status",
            "owner",
            "owner_id",
            "location",
            "purchase_date",
            "warranty_expires_on",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")


class KnowledgeFeedbackSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = KnowledgeFeedback
        fields = ("id", "article", "user", "rating", "helpful", "comment", "created_at")
        read_only_fields = ("id", "user", "created_at")

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise ValidationError("Rating must be between 1 and 5.")
        return value


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "kind", "title", "body", "link", "is_read", "created_at")
        read_only_fields = ("id", "created_at")


class CatalogItemSerializer(serializers.ModelSerializer):
    form = serializers.SerializerMethodField()
    form_id = serializers.PrimaryKeyRelatedField(
        source="form", queryset=DynamicForm.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = CatalogItem
        fields = (
            "id",
            "name",
            "description",
            "category",
            "is_active",
            "requires_approval",
            "fulfillment_instructions",
            "form",
            "form_id",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_form(self, obj):
        if not obj.form_id:
            return None
        return {
            "id": str(obj.form_id),
            "name": obj.form.name,
            "status": obj.form.status,
            "record_type": obj.form.record_type,
            "version": obj.form.version,
        }


class CatalogRequestSerializer(serializers.ModelSerializer):
    item = CatalogItemSerializer(read_only=True)
    requester = UserSummarySerializer(read_only=True)
    ticket = TicketSerializer(read_only=True)
    item_id = serializers.PrimaryKeyRelatedField(source="item", queryset=CatalogItem.objects.all(), write_only=True)

    class Meta:
        model = CatalogRequest
        fields = (
            "id",
            "item",
            "item_id",
            "requester",
            "status",
            "variables",
            "ticket",
            "approved_by",
            "approved_at",
            "requested_at",
            "updated_at",
        )
        read_only_fields = ("id", "requester", "ticket", "approved_by", "approved_at", "requested_at", "updated_at")


class KnownErrorSerializer(serializers.ModelSerializer):
    problem_ticket = TicketSerializer(read_only=True)
    related_article = KnowledgeArticleSerializer(read_only=True)
    problem_ticket_id = serializers.PrimaryKeyRelatedField(source="problem_ticket", queryset=Ticket.objects.all(), write_only=True)
    related_article_id = serializers.PrimaryKeyRelatedField(
        source="related_article", queryset=KnowledgeArticle.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = KnownError
        fields = ("id", "problem_ticket", "problem_ticket_id", "symptoms", "workaround", "related_article", "related_article_id", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class CabMeetingSerializer(serializers.ModelSerializer):
    changes = TicketSerializer(many=True, read_only=True)
    change_ids = serializers.PrimaryKeyRelatedField(source="changes", queryset=Ticket.objects.all(), many=True, write_only=True, required=False)

    class Meta:
        model = CabMeeting
        fields = ("id", "title", "start_at", "end_at", "location", "notes", "changes", "change_ids", "created_at")
        read_only_fields = ("id", "created_at", "changes")


class AuditEventSerializer(serializers.ModelSerializer):
    actor = UserSummarySerializer(read_only=True)

    class Meta:
        model = AuditEvent
        fields = ("id", "actor", "action", "object_type", "object_id", "summary", "data", "created_at")
        read_only_fields = ("id", "created_at")


class SlaPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = SlaPolicy
        fields = ("id", "kind", "priority", "resolution_minutes", "at_risk_minutes", "is_active", "updated_at")
        read_only_fields = ("id", "updated_at")


class WarRoomParticipantSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = WarRoomParticipant
        fields = ("id", "user", "guest_name", "role", "joined_at", "left_at")
        read_only_fields = ("id", "joined_at", "left_at", "user")


class WarRoomMessageSerializer(serializers.ModelSerializer):
    author = UserSummarySerializer(read_only=True)
    parent_id = serializers.PrimaryKeyRelatedField(
        source="parent", queryset=WarRoomMessage.objects.all(), write_only=True, required=False, allow_null=True
    )

    class Meta:
        model = WarRoomMessage
        fields = ("id", "author", "guest_name", "body", "parent", "parent_id", "created_at")
        read_only_fields = ("id", "author", "guest_name", "parent", "created_at")


class WarRoomSerializer(serializers.ModelSerializer):
    ticket = TicketSerializer(read_only=True)
    participants = WarRoomParticipantSerializer(many=True, read_only=True)

    class Meta:
        model = WarRoom
        fields = (
            "id",
            "ticket",
            "is_active",
            "slack_webhook_url",
            "teams_webhook_url",
            "participants",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "ticket", "participants", "created_at", "updated_at")


class PointEventSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = PointEvent
        fields = ("id", "user", "ticket", "points", "reason", "created_at")
        read_only_fields = ("id", "user", "created_at")


class UserBadgeSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserBadge
        fields = ("id", "key", "title", "created_at")
        read_only_fields = ("id", "created_at")


class TeamChallengeSerializer(serializers.ModelSerializer):
    team = TeamSerializer(read_only=True)
    team_id = serializers.PrimaryKeyRelatedField(source="team", queryset=Team.objects.all(), write_only=True)

    class Meta:
        model = TeamChallenge
        fields = ("id", "team", "team_id", "kind", "title", "description", "goal", "start_at", "end_at", "is_active", "created_at")
        read_only_fields = ("id", "team", "created_at")


class ReportDefinitionSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = ReportDefinition
        fields = ("id", "name", "dataset", "selected_fields", "conditions", "is_public", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "created_by", "created_at", "updated_at")


class ReportScheduleSerializer(serializers.ModelSerializer):
    report = ReportDefinitionSerializer(read_only=True)
    report_id = serializers.PrimaryKeyRelatedField(source="report", queryset=ReportDefinition.objects.all(), write_only=True)

    class Meta:
        model = ReportSchedule
        fields = (
            "id",
            "report",
            "report_id",
            "frequency",
            "format",
            "recipients",
            "is_active",
            "next_run_at",
            "last_run_at",
            "created_at",
        )
        read_only_fields = ("id", "report", "last_run_at", "created_at")


class BarcodeTemplateSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = BarcodeTemplate
        fields = ("id", "name", "template", "is_active", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "created_by", "created_at", "updated_at")


class AssetTransactionSerializer(serializers.ModelSerializer):
    performed_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = AssetTransaction
        fields = ("id", "asset", "action", "performed_by", "notes", "performed_at")
        read_only_fields = ("id", "performed_by", "performed_at")


class AssetMetricSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetMetric
        fields = ("id", "asset", "captured_at", "cpu_pct", "memory_pct", "temperature_c", "data", "created_at")
        read_only_fields = ("id", "created_at")


class AssetAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetAlert
        fields = ("id", "asset", "kind", "severity", "message", "is_open", "created_at", "resolved_at")
        read_only_fields = ("id", "created_at", "resolved_at")


class AssetRecommendationSerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetRecommendation
        fields = ("id", "asset", "kind", "message", "created_at")
        read_only_fields = ("id", "created_at")


class WorkflowVersionSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = WorkflowVersion
        fields = ("id", "workflow", "version", "status", "schema", "test_cases", "created_by", "created_at")
        read_only_fields = ("id", "created_by", "created_at", "version")


class WorkflowSerializer(serializers.ModelSerializer):
    created_by = UserSummarySerializer(read_only=True)
    deployed_version = WorkflowVersionSerializer(read_only=True)

    class Meta:
        model = Workflow
        fields = ("id", "name", "kind", "is_active", "deployed_version", "created_by", "created_at", "updated_at")
        read_only_fields = ("id", "deployed_version", "created_by", "created_at", "updated_at")


class WorkflowRunSerializer(serializers.ModelSerializer):
    workflow_version = WorkflowVersionSerializer(read_only=True)

    class Meta:
        model = WorkflowRun
        fields = ("id", "workflow_version", "sandbox", "input", "output", "logs", "status", "error", "started_at", "finished_at")
        read_only_fields = ("id", "workflow_version", "started_at", "finished_at")


class TicketNumberConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = TicketNumberConfig
        fields = ("id", "prefix", "padding", "updated_at")
        read_only_fields = ("id", "updated_at")


class SystemSettingSerializer(serializers.ModelSerializer):
    updated_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = SystemSetting
        fields = ("id", "key", "value", "updated_by", "updated_at")
        read_only_fields = ("id", "updated_by", "updated_at")


class RewardSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reward
        fields = ("id", "name", "description", "cost_points", "is_active", "stock", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class RewardRedemptionSerializer(serializers.ModelSerializer):
    reward = RewardSerializer(read_only=True)
    user = UserSummarySerializer(read_only=True)

    class Meta:
        model = RewardRedemption
        fields = ("id", "reward", "user", "cost_points", "status", "created_at", "decided_at")
        read_only_fields = ("id", "reward", "user", "cost_points", "created_at", "decided_at")

class UserPreferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserPreference
        fields = ("theme", "accent", "density", "updated_at")
        read_only_fields = ("updated_at",)


class DynamicFormSerializer(serializers.ModelSerializer):
    class Meta:
        model = DynamicForm
        fields = (
            "id",
            "name",
            "description",
            "status",
            "record_type",
            "version",
            "schema",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "version", "created_by", "updated_by", "created_at", "updated_at")

    def validate_schema(self, value):
        if not isinstance(value, dict):
            raise ValidationError("Schema must be an object.")
        sections = value.get("sections", [])
        if sections and not isinstance(sections, list):
            raise ValidationError("Schema.sections must be a list.")
        return value


class ConfigNamespaceSerializer(serializers.ModelSerializer):
    """Serializer for configuration namespaces (master data grouping)."""

    updated_by = UserSummarySerializer(read_only=True)

    class Meta:
        model = ConfigNamespace
        fields = ("id", "key", "name", "description", "is_active", "updated_by", "updated_at")
        read_only_fields = ("id", "updated_by", "updated_at")


class ConfigEntrySerializer(serializers.ModelSerializer):
    """Serializer for configuration entries stored under a namespace."""

    namespace_key = serializers.CharField(source="namespace.key", read_only=True)
    updated_by = UserSummarySerializer(read_only=True)

    namespace_id = serializers.PrimaryKeyRelatedField(source="namespace", queryset=ConfigNamespace.objects.all(), write_only=True)

    class Meta:
        model = ConfigEntry
        fields = (
            "id",
            "namespace_key",
            "namespace_id",
            "key",
            "label",
            "description",
            "value",
            "sort_order",
            "is_active",
            "updated_by",
            "updated_at",
        )
        read_only_fields = ("id", "namespace_key", "updated_by", "updated_at")
