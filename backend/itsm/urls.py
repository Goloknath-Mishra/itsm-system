from __future__ import annotations

from django.urls import include, path
from rest_framework.routers import DefaultRouter

from itsm.api.access import AdminRolesView, AdminUserViewSet
from itsm.api.analytics import AnalyticsView, AssetAnalyticsView
from itsm.api.admin import (
    AuditEventViewSet,
    GamificationAchievementsView,
    GamificationBalanceView,
    GamificationHallOfFameView,
    GamificationLeaderboardView,
    MyBadgesView,
    ReportDefinitionViewSet,
    ReportScheduleViewSet,
    RewardRedemptionAdminViewSet,
    RewardViewSet,
    SlaPolicyViewSet,
    SystemSettingViewSet,
    TeamChallengeViewSet,
    TicketNumberConfigViewSet,
    WorkflowViewSet,
    WorkflowVersionViewSet,
)
from itsm.api.operations import (
    AssetAlertViewSet,
    AssetMetricViewSet,
    AssetRecommendationViewSet,
    AssetViewSet,
    BarcodeTemplateViewSet,
    CabMeetingViewSet,
    CatalogItemViewSet,
    CatalogRequestViewSet,
    DynamicFormViewSet,
    KnowledgeArticleViewSet,
    KnownErrorViewSet,
    NotificationViewSet,
    ServiceRelationshipViewSet,
    ServiceViewSet,
    VirtualAgentView,
    WarRoomViewSet,
)
from itsm.api.search import GlobalSearchView
from itsm.api.tickets import TeamViewSet, TicketViewSet
from itsm.api.users import MeView, PasswordResetConfirmView, PasswordResetRequestView, PreferenceView
from itsm.api.config import ConfigEntryViewSet, ConfigNamespaceViewSet

router = DefaultRouter()
router.register("teams", TeamViewSet, basename="team")
router.register("tickets", TicketViewSet, basename="ticket")
router.register("knowledge", KnowledgeArticleViewSet, basename="knowledge")
router.register("assets", AssetViewSet, basename="asset")
router.register("barcode-templates", BarcodeTemplateViewSet, basename="barcode-template")
router.register("asset-metrics", AssetMetricViewSet, basename="asset-metric")
router.register("asset-alerts", AssetAlertViewSet, basename="asset-alert")
router.register("asset-recommendations", AssetRecommendationViewSet, basename="asset-recommendation")
router.register("forms", DynamicFormViewSet, basename="form")
router.register("catalog/items", CatalogItemViewSet, basename="catalog-item")
router.register("catalog/requests", CatalogRequestViewSet, basename="catalog-request")
router.register("notifications", NotificationViewSet, basename="notification")
router.register("services", ServiceViewSet, basename="service")
router.register("service-relationships", ServiceRelationshipViewSet, basename="service-relationship")
router.register("sla-policies", SlaPolicyViewSet, basename="sla-policy")
router.register("known-errors", KnownErrorViewSet, basename="known-error")
router.register("cab-meetings", CabMeetingViewSet, basename="cab-meeting")
router.register("audit-events", AuditEventViewSet, basename="audit-event")
router.register("war-rooms", WarRoomViewSet, basename="war-room")
router.register("challenges", TeamChallengeViewSet, basename="challenge")
router.register("reports", ReportDefinitionViewSet, basename="report")
router.register("report-schedules", ReportScheduleViewSet, basename="report-schedule")
router.register("workflows", WorkflowViewSet, basename="workflow")
router.register("workflow-versions", WorkflowVersionViewSet, basename="workflow-version")
router.register("rewards", RewardViewSet, basename="reward")
router.register("reward-redemptions", RewardRedemptionAdminViewSet, basename="reward-redemption")
router.register("system-settings", SystemSettingViewSet, basename="system-setting")
router.register("ticket-number-config", TicketNumberConfigViewSet, basename="ticket-number-config")
router.register("admin/users", AdminUserViewSet, basename="admin-user")
router.register("config/namespaces", ConfigNamespaceViewSet, basename="config-namespace")
router.register("config/entries", ConfigEntryViewSet, basename="config-entry")

urlpatterns = [
    path("me/", MeView.as_view(), name="me"),
    path("preferences/", PreferenceView.as_view(), name="preferences"),
    path("analytics/", AnalyticsView.as_view(), name="analytics"),
    path("asset-analytics/", AssetAnalyticsView.as_view(), name="asset-analytics"),
    path("search/", GlobalSearchView.as_view(), name="global-search"),
    path("admin/roles/", AdminRolesView.as_view(), name="admin-roles"),
    path("gamification/leaderboard/", GamificationLeaderboardView.as_view(), name="gamification-leaderboard"),
    path("gamification/my-badges/", MyBadgesView.as_view(), name="gamification-my-badges"),
    path("gamification/achievements/", GamificationAchievementsView.as_view(), name="gamification-achievements"),
    path("gamification/hall-of-fame/", GamificationHallOfFameView.as_view(), name="gamification-hall-of-fame"),
    path("gamification/balance/", GamificationBalanceView.as_view(), name="gamification-balance"),
    path("virtual-agent/", VirtualAgentView.as_view(), name="virtual-agent"),
    path("auth/password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path("auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("", include(router.urls)),
]
