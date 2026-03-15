from __future__ import annotations

from datetime import timedelta, datetime
import uuid
import csv
import io
import urllib.request
import urllib.error
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.conf import settings
from django.core.mail import EmailMessage, send_mail
from django.http import HttpResponse
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.models import (
    Asset,
    AssetTransaction,
    AssetMetric,
    AssetAlert,
    AssetRecommendation,
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
    Team,
    TeamChallenge,
    Ticket,
    TicketApproval,
    TicketComment,
    TicketNumberConfig,
    PointEvent,
    ReportDefinition,
    ReportSchedule,
    Reward,
    RewardRedemption,
    SystemSetting,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
    UserPreference,
    UserBadge,
    WarRoom,
    WarRoomMessage,
    WarRoomParticipant,
)
from itsm.permissions import IsAgent, IsPrivileged
from itsm.serializers import (
    AuditEventSerializer,
    AssetSerializer,
    AssetTransactionSerializer,
    AssetMetricSerializer,
    AssetAlertSerializer,
    AssetRecommendationSerializer,
    BarcodeTemplateSerializer,
    CabMeetingSerializer,
    CatalogItemSerializer,
    CatalogRequestSerializer,
    DynamicFormSerializer,
    KnowledgeFeedbackSerializer,
    KnowledgeArticleSerializer,
    KnownErrorSerializer,
    NotificationSerializer,
    ServiceRelationshipSerializer,
    ServiceSerializer,
    SlaPolicySerializer,
    TeamSerializer,
    TicketApprovalInputSerializer,
    TicketApprovalSerializer,
    TicketCommentCreateSerializer,
    TicketCommentSerializer,
    TicketSerializer,
    TicketNumberConfigSerializer,
    AdminUserSerializer,
    UserSummarySerializer,
    UserPreferenceSerializer,
    WarRoomMessageSerializer,
    WarRoomSerializer,
    PointEventSerializer,
    ReportDefinitionSerializer,
    ReportScheduleSerializer,
    WorkflowRunSerializer,
    WorkflowSerializer,
    WorkflowVersionSerializer,
    TeamChallengeSerializer,
    UserBadgeSerializer,
    RewardRedemptionSerializer,
    RewardSerializer,
    SystemSettingSerializer,
)

User = get_user_model()


def create_audit_event(*, actor, action: str, obj, summary: str = "", data: dict | None = None):
    """Write an audit event for key actions (CRUD, status changes, access changes)."""
    object_id = getattr(obj, "id", None)
    if not isinstance(object_id, uuid.UUID):
        object_id = None
    AuditEvent.objects.create(
        actor=actor,
        action=action,
        object_type=obj.__class__.__name__,
        object_id=object_id,
        summary=summary,
        data=data or {},
    )


def send_webhook(url: str, payload: dict):
    """Send a basic JSON webhook message to an external endpoint (Teams/Slack)."""
    if not url:
        return
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):
            return
    except Exception:
        return


def get_global_webhooks() -> tuple[str, str]:
    """Resolve global Teams/Slack webhook URLs from settings and DB-backed configuration."""
    teams_url = getattr(settings, "TEAMS_WEBHOOK_URL", "") or ""
    slack_url = getattr(settings, "SLACK_WEBHOOK_URL", "") or ""
    if teams_url and slack_url:
        return teams_url, slack_url
    cfg = SystemSetting.objects.filter(key="notifications").first()
    if cfg and isinstance(cfg.value, dict):
        if not teams_url:
            teams_url = str(cfg.value.get("teams_webhook_url") or "")
        if not slack_url:
            slack_url = str(cfg.value.get("slack_webhook_url") or "")
    return teams_url, slack_url


def simple_pdf(title: str, lines: list[str]) -> bytes:
    text_lines = [title, ""] + lines
    y = 792
    chunks = []
    for ln in text_lines[:70]:
        safe = ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        chunks.append(f"1 0 0 1 50 {y} Tm ({safe}) Tj")
        y -= 12
    stream = "BT /F1 10 Tf " + " ".join(chunks) + " ET"
    content = stream.encode("latin-1", errors="ignore")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources<< /Font<< /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n")
    objects.append(b"4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
    objects.append(b"5 0 obj<< /Length %d >>stream\n" % len(content) + content + b"\nendstream\nendobj\n")
    xref = [0]
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    for obj in objects:
        xref.append(pdf.tell())
        pdf.write(obj)
    xref_start = pdf.tell()
    pdf.write(b"xref\n0 %d\n" % (len(objects) + 1))
    pdf.write(b"0000000000 65535 f \n")
    for off in xref[1:]:
        pdf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    pdf.write(b"trailer<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1))
    pdf.write(b"startxref\n")
    pdf.write(str(xref_start).encode("ascii") + b"\n%%EOF")
    return pdf.getvalue()


def simple_xlsx(headers: list[str], rows: list[list[str]]) -> bytes:
    def esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    sheet_rows = []
    r = 1
    sheet_rows.append(
        "<row r='1'>" + "".join([f"<c t='inlineStr'><is><t>{esc(h)}</t></is></c>" for h in headers]) + "</row>"
    )
    r += 1
    for row in rows:
        sheet_rows.append(
            f"<row r='{r}'>" + "".join([f"<c t='inlineStr'><is><t>{esc(str(v))}</t></is></c>" for v in row]) + "</row>"
        )
        r += 1

    sheet_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<worksheet xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'>"
        "<sheetData>"
        + "".join(sheet_rows)
        + "</sheetData>"
        "</worksheet>"
    )

    workbook_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<workbook xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main' "
        "xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'>"
        "<sheets><sheet name='Report' sheetId='1' r:id='rId1'/></sheets>"
        "</workbook>"
    )

    rels_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet' Target='worksheets/sheet1.xml'/>"
        "</Relationships>"
    )

    root_rels_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='xl/workbook.xml'/>"
        "</Relationships>"
    )

    content_types_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
        "<Default Extension='xml' ContentType='application/xml'/>"
        "<Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/>"
        "<Override PartName='/xl/worksheets/sheet1.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>"
        "</Types>"
    )

    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml)
        z.writestr("_rels/.rels", root_rels_xml)
        z.writestr("xl/workbook.xml", workbook_xml)
        z.writestr("xl/_rels/workbook.xml.rels", rels_xml)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return out.getvalue()


CODE39 = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    "A": "wnnnnwnnw",
    "B": "nnwnnwnnw",
    "C": "wnwnnwnnn",
    "D": "nnnnwwnnw",
    "E": "wnnnwwnnn",
    "F": "nnwnwwnnn",
    "G": "nnnnnwwnw",
    "H": "wnnnnwwnn",
    "I": "nnwnnwwnn",
    "J": "nnnnwwwnn",
    "K": "wnnnnnnww",
    "L": "nnwnnnnww",
    "M": "wnwnnnnwn",
    "N": "nnnnwnnww",
    "O": "wnnnwnnwn",
    "P": "nnwnwnnwn",
    "Q": "nnnnnnwww",
    "R": "wnnnnnwwn",
    "S": "nnwnnnwwn",
    "T": "nnnnwnwwn",
    "U": "wwnnnnnnw",
    "V": "nwwnnnnnw",
    "W": "wwwnnnnnn",
    "X": "nwnnwnnnw",
    "Y": "wwnnwnnnn",
    "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    "$": "nwnwnwnnn",
    "/": "nwnwnnnwn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn",
}


def code39_svg(value: str, *, height: int = 80, unit: int = 2, wide: int = 5) -> tuple[str, int]:
    v = value.strip().upper()
    if not v:
        v = "0"
    encoded = "*" + "".join([ch for ch in v if ch in CODE39]) + "*"
    x = 0
    rects = []
    for ch in encoded:
        pattern = CODE39.get(ch, CODE39["0"])
        for i, p in enumerate(pattern):
            w = wide if p == "w" else unit
            is_bar = i % 2 == 0
            if is_bar:
                rects.append(f"<rect x='{x}' y='0' width='{w}' height='{height}' fill='black'/>")
            x += w
        x += unit
    width = x
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>{''.join(rects)}</svg>"
    return svg, width


def code39_pdf(value: str, *, page_w: int = 612, page_h: int = 288) -> bytes:
    svg, width = code39_svg(value, height=80, unit=2, wide=5)
    v = value.strip().upper()
    if not v:
        v = "0"
    encoded = "*" + "".join([ch for ch in v if ch in CODE39]) + "*"
    x = 50
    y = 150
    ops = []
    for ch in encoded:
        pattern = CODE39.get(ch, CODE39["0"])
        for i, p in enumerate(pattern):
            w = 5 if p == "w" else 2
            is_bar = i % 2 == 0
            if is_bar:
                ops.append(f"{x} {y} {w} 80 re f")
            x += w
        x += 2
    safe = v.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    ops.append(f"BT /F1 12 Tf 50 120 Tm ({safe}) Tj ET")
    stream = "0 0 0 rg " + " ".join(ops)
    content = stream.encode("latin-1", errors="ignore")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        f"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w} {page_h}] /Resources<< /Font<< /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n".encode(
            "ascii"
        )
    )
    objects.append(b"4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
    objects.append(b"5 0 obj<< /Length %d >>stream\n" % len(content) + content + b"\nendstream\nendobj\n")
    xref = [0]
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    for obj in objects:
        xref.append(pdf.tell())
        pdf.write(obj)
    xref_start = pdf.tell()
    pdf.write(b"xref\n0 %d\n" % (len(objects) + 1))
    pdf.write(b"0000000000 65535 f \n")
    for off in xref[1:]:
        pdf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    pdf.write(b"trailer<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1))
    pdf.write(b"startxref\n")
    pdf.write(str(xref_start).encode("ascii") + b"\n%%EOF")
    return pdf.getvalue()


class MeView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        return Response(UserSummarySerializer(request.user).data)

    def patch(self, request):
        user = request.user
        payload = request.data or {}

        allowed = {"first_name", "last_name", "email"}
        for key in list(payload.keys()):
            if key not in allowed:
                payload.pop(key, None)

        if not payload:
            return Response(UserSummarySerializer(user).data)

        for key, value in payload.items():
            setattr(user, key, value)
        user.save(update_fields=list(payload.keys()))
        return Response(UserSummarySerializer(user).data)


class PreferenceView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        pref, _ = UserPreference.objects.get_or_create(user=request.user)
        return Response(UserPreferenceSerializer(pref).data)

    def patch(self, request):
        pref, _ = UserPreference.objects.get_or_create(user=request.user)
        serializer = UserPreferenceSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserPreferenceSerializer(pref).data)


class AdminRolesView(APIView):
    """Expose supported RBAC roles to drive the admin UI."""

    permission_classes = (IsPrivileged,)

    def get(self, request):
        roles = [
            {"name": "ITSM_ADMIN", "label": "Privileged Admin", "description": "Manage access, configuration, and master data."},
            {"name": "ITSM_AGENT", "label": "Agent", "description": "Handle operational ITSM work (tickets, approvals, fulfillment)."},
            {"name": "ITSM_REQUESTER", "label": "Requester", "description": "Create and track own incidents/requests and use portal."},
        ]
        return Response({"roles": roles})


class AdminUserViewSet(viewsets.ModelViewSet):
    """Privileged user management endpoints for RBAC assignment."""

    serializer_class = AdminUserSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("is_staff", "is_superuser")
    search_fields = ("username", "first_name", "last_name", "email")
    ordering_fields = ("username", "email", "id")

    def get_queryset(self):
        return User.objects.all().order_by("username")

    def perform_update(self, serializer):
        user = serializer.save()
        create_audit_event(actor=self.request.user, action="access.user_update", obj=user, summary=user.username)


class AnalyticsView(APIView):
    permission_classes = (IsAgent,)

    def get(self, request):
        now = timezone.now()
        week_ago = now - timedelta(days=7)
        open_qs = Ticket.objects.filter(~Q(status__in=[Ticket.Status.CLOSED, Ticket.Status.CANCELED]))
        kpis = {
            "open": open_qs.count(),
            "critical_open": open_qs.filter(priority=Ticket.Priority.P1).count(),
            "breached": open_qs.filter(sla_status=Ticket.SlaStatus.BREACHED).count(),
            "created_last_7d": Ticket.objects.filter(created_at__gte=week_ago).count(),
            "resolved_last_7d": Ticket.objects.filter(updated_at__gte=week_ago, status=Ticket.Status.RESOLVED).count(),
            "knowledge_articles": KnowledgeArticle.objects.count(),
            "catalog_items": CatalogItem.objects.filter(is_active=True).count(),
        }
        return Response(kpis)


class GamificationLeaderboardView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        now = timezone.now()
        period = (request.query_params.get("period") or "daily").lower()
        if period == "weekly":
            start = now - timedelta(days=7)
        elif period == "monthly":
            start = now - timedelta(days=30)
        else:
            start = now - timedelta(days=1)

        qs = PointEvent.objects.filter(created_at__gte=start).select_related("user")
        totals = {}
        for e in qs:
            key = e.user_id
            row = totals.get(key) or {"user": UserSummarySerializer(e.user).data, "points": 0, "events": 0}
            row["points"] += int(e.points)
            row["events"] += 1
            totals[key] = row
        leaders = sorted(totals.values(), key=lambda r: r["points"], reverse=True)[:25]
        return Response({"period": period, "leaders": leaders})


class MyBadgesView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        qs = UserBadge.objects.filter(user=request.user).order_by("-created_at")
        return Response(UserBadgeSerializer(qs, many=True).data)


class GamificationBalanceView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        earned = PointEvent.objects.filter(user=request.user).aggregate(total=Sum("points"))["total"] or 0
        spent = (
            RewardRedemption.objects.filter(user=request.user)
            .exclude(status=RewardRedemption.Status.REJECTED)
            .aggregate(total=Sum("cost_points"))["total"]
            or 0
        )
        return Response({"earned": int(earned), "spent": int(spent), "balance": int(earned) - int(spent)})


class GamificationAchievementsView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        user = request.user
        total_points = PointEvent.objects.filter(user=user).aggregate(total=Sum("points"))["total"] or 0
        sla_resolves = PointEvent.objects.filter(user=user, reason="SLA_RESOLVE").count()
        kb_published = KnowledgeArticle.objects.filter(author=user, status=KnowledgeArticle.Status.PUBLISHED).count()
        war_room_msgs = WarRoomMessage.objects.filter(author=user).count()
        workflows_deployed = WorkflowVersion.objects.filter(created_by=user, status=WorkflowVersion.Status.DEPLOYED).count()

        defs = [
            ("first_responder", "First Responder", "Resolve your first ticket within SLA.", sla_resolves, 1),
            ("sla_hero", "SLA Hero", "Resolve 10 tickets within SLA.", sla_resolves, 10),
            ("knowledge_contributor", "Knowledge Contributor", "Publish your first knowledge article.", kb_published, 1),
            ("knowledge_champion", "Knowledge Champion", "Publish 5 knowledge articles.", kb_published, 5),
            ("war_room_leader", "War Room Leader", "Post 10 messages in war rooms.", war_room_msgs, 10),
            ("workflow_master", "Workflow Master", "Deploy your first workflow version.", workflows_deployed, 1),
            ("all_rounder", "All-rounder", "Earn 200 total points.", total_points, 200),
        ]

        items = []
        for key, title, desc, progress, goal in defs:
            progress_i = int(progress)
            goal_i = int(goal)
            items.append(
                {
                    "key": key,
                    "title": title,
                    "description": desc,
                    "progress": progress_i,
                    "goal": goal_i,
                    "achieved": progress_i >= goal_i,
                    "percent": 100 if goal_i == 0 else min(100, int((progress_i / goal_i) * 100)),
                }
            )
        return Response({"items": items})


class GamificationHallOfFameView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        all_time = (
            PointEvent.objects.values("user")
            .annotate(points=Sum("points"), events=Count("id"))
            .order_by("-points")[:10]
        )
        user_ids = [row["user"] for row in all_time]
        users = {u.id: u for u in User.objects.filter(id__in=user_ids)}
        all_time_rows = []
        for row in all_time:
            u = users.get(row["user"])
            if not u:
                continue
            all_time_rows.append(
                {"user": UserSummarySerializer(u).data, "points": int(row["points"] or 0), "events": int(row["events"] or 0)}
            )

        month_rows = (
            PointEvent.objects.annotate(month=TruncMonth("created_at"))
            .values("month", "user")
            .annotate(points=Sum("points"), events=Count("id"))
            .order_by("-month", "-points")
        )
        monthly = []
        seen = set()
        for r in month_rows:
            m = r["month"]
            if not m:
                continue
            key = m.strftime("%Y-%m")
            if key in seen:
                continue
            seen.add(key)
            u = users.get(r["user"]) or User.objects.filter(id=r["user"]).first()
            if not u:
                continue
            monthly.append(
                {
                    "month": key,
                    "winner": {"user": UserSummarySerializer(u).data, "points": int(r["points"] or 0), "events": int(r["events"] or 0)},
                }
            )
            if len(monthly) >= 6:
                break

        return Response({"all_time": all_time_rows, "monthly_champions": monthly})


class RewardViewSet(viewsets.ModelViewSet):
    serializer_class = RewardSerializer
    filterset_fields = ("is_active",)
    ordering_fields = ("updated_at", "created_at", "cost_points")
    search_fields = ("name", "description")

    def get_permissions(self):
        if self.action in ("list", "retrieve", "redeem", "my_redemptions"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        qs = Reward.objects.all().order_by("-updated_at")
        if self.request.user.is_staff:
            return qs
        return qs.filter(is_active=True)

    @action(detail=True, methods=["post"], url_path="redeem")
    def redeem(self, request, pk=None):
        reward = self.get_object()
        if not reward.is_active:
            return Response({"detail": "Reward is inactive."}, status=status.HTTP_400_BAD_REQUEST)
        if reward.stock is not None and reward.stock <= 0:
            return Response({"detail": "Reward is out of stock."}, status=status.HTTP_400_BAD_REQUEST)

        earned = PointEvent.objects.filter(user=request.user).aggregate(total=Sum("points"))["total"] or 0
        spent = (
            RewardRedemption.objects.filter(user=request.user)
            .exclude(status=RewardRedemption.Status.REJECTED)
            .aggregate(total=Sum("cost_points"))["total"]
            or 0
        )
        balance = int(earned) - int(spent)
        if balance < reward.cost_points:
            return Response({"detail": "Insufficient points."}, status=status.HTTP_400_BAD_REQUEST)

        redemption = RewardRedemption.objects.create(
            reward=reward,
            user=request.user,
            cost_points=reward.cost_points,
            status=RewardRedemption.Status.REQUESTED,
        )
        if reward.stock is not None:
            reward.stock = max(0, reward.stock - 1)
            reward.save(update_fields=["stock", "updated_at"])
        create_audit_event(actor=request.user, action="gamification.redeem", obj=reward, summary=reward.name)
        return Response(RewardRedemptionSerializer(redemption).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="my-redemptions")
    def my_redemptions(self, request):
        qs = RewardRedemption.objects.filter(user=request.user).select_related("reward").order_by("-created_at")[:50]
        return Response(RewardRedemptionSerializer(qs, many=True).data)


class RewardRedemptionAdminViewSet(viewsets.ModelViewSet):
    serializer_class = RewardRedemptionSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("status", "user", "reward")
    ordering_fields = ("created_at", "decided_at")

    def get_queryset(self):
        return RewardRedemption.objects.select_related("reward", "user").order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="set-status")
    def set_status(self, request, pk=None):
        r = self.get_object()
        new_status = (request.data or {}).get("status")
        valid = {c[0] for c in RewardRedemption.Status.choices}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        r.status = new_status
        r.decided_at = timezone.now()
        r.save(update_fields=["status", "decided_at"])
        create_audit_event(actor=request.user, action="gamification.redemption_status", obj=r.reward, summary=new_status)
        return Response(RewardRedemptionSerializer(r).data)


class TicketNumberConfigViewSet(viewsets.ModelViewSet):
    serializer_class = TicketNumberConfigSerializer
    permission_classes = (IsPrivileged,)

    def get_queryset(self):
        return TicketNumberConfig.objects.all()

    def list(self, request):
        obj, _ = TicketNumberConfig.objects.get_or_create(id=1, defaults={"prefix": "ITSM-", "padding": 6})
        return Response(TicketNumberConfigSerializer(obj).data)

    def retrieve(self, request, pk=None):
        obj, _ = TicketNumberConfig.objects.get_or_create(id=1, defaults={"prefix": "ITSM-", "padding": 6})
        return Response(TicketNumberConfigSerializer(obj).data)

    def update(self, request, pk=None):
        obj, _ = TicketNumberConfig.objects.get_or_create(id=1, defaults={"prefix": "ITSM-", "padding": 6})
        ser = TicketNumberConfigSerializer(obj, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        create_audit_event(actor=request.user, action="settings.auto_number", obj=obj, summary=obj.prefix)
        return Response(TicketNumberConfigSerializer(obj).data)


class SystemSettingViewSet(viewsets.ModelViewSet):
    serializer_class = SystemSettingSerializer
    permission_classes = (IsPrivileged,)
    lookup_field = "key"
    filterset_fields = ("key",)
    search_fields = ("key",)

    def get_queryset(self):
        return SystemSetting.objects.select_related("updated_by").order_by("key")

    def perform_create(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="settings.create", obj=obj, summary=obj.key)

    def perform_update(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="settings.update", obj=obj, summary=obj.key)


class TeamChallengeViewSet(viewsets.ModelViewSet):
    serializer_class = TeamChallengeSerializer
    filterset_fields = ("team", "kind", "is_active")
    ordering_fields = ("start_at", "end_at", "created_at")
    search_fields = ("title", "description")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return TeamChallenge.objects.select_related("team", "created_by").order_by("-created_at")

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        create_audit_event(actor=self.request.user, action="challenge.create", obj=obj, summary=obj.title)

    @action(detail=True, methods=["get"], url_path="progress")
    def progress(self, request, pk=None):
        ch = self.get_object()
        now = timezone.now()
        start = ch.start_at
        end = ch.end_at
        if now < start:
            window_end = start
        elif now > end:
            window_end = end
        else:
            window_end = now

        if ch.kind == TeamChallenge.Kind.RESOLVE_SLA:
            count = PointEvent.objects.filter(
                created_at__gte=start,
                created_at__lte=window_end,
                reason="SLA_RESOLVE",
                ticket__assignment_group=ch.team,
            ).count()
        else:
            count = PointEvent.objects.filter(
                created_at__gte=start,
                created_at__lte=window_end,
                reason="KNOWLEDGE_PUBLISH",
            ).count()

        pct = 0 if ch.goal == 0 else min(100, int((count / ch.goal) * 100))
        return Response({"count": count, "goal": ch.goal, "percent": pct, "start_at": ch.start_at, "end_at": ch.end_at})


def report_dataset_config(dataset: str):
    if dataset == ReportDefinition.Dataset.TICKETS:
        qs = Ticket.objects.select_related("assignee", "assignment_group", "requester", "affected_service")
        fields = {
            "number": "number",
            "kind": "kind",
            "status": "status",
            "priority": "priority",
            "impact": "impact",
            "urgency": "urgency",
            "category": "category",
            "subcategory": "subcategory",
            "title": "title",
            "assignee": "assignee__username",
            "assignment_group": "assignment_group__name",
            "requester": "requester__username",
            "sla_status": "sla_status",
            "due_at": "due_at",
            "created_at": "created_at",
            "updated_at": "updated_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.ASSETS:
        qs = Asset.objects.select_related("owner")
        fields = {
            "asset_tag": "asset_tag",
            "name": "name",
            "status": "status",
            "owner": "owner__username",
            "location": "location",
            "vendor": "vendor",
            "model": "model",
            "serial_number": "serial_number",
            "updated_at": "updated_at",
            "created_at": "created_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.KNOWLEDGE:
        qs = KnowledgeArticle.objects.select_related("author")
        fields = {
            "title": "title",
            "category": "category",
            "status": "status",
            "author": "author__username",
            "published_at": "published_at",
            "updated_at": "updated_at",
            "created_at": "created_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.CATALOG_REQUESTS:
        qs = CatalogRequest.objects.select_related("item", "requester", "ticket")
        fields = {
            "id": "id",
            "item": "item__name",
            "status": "status",
            "requester": "requester__username",
            "approved_at": "approved_at",
            "requested_at": "requested_at",
            "updated_at": "updated_at",
            "ticket_number": "ticket__number",
        }
        return qs, fields

    return Ticket.objects.none(), {}


def parse_value(v):
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            return int(s)
        return s
    return v


def build_report_q(node: dict, field_map: dict[str, str]) -> Q:
    if not isinstance(node, dict):
        return Q()
    node_type = (node.get("type") or "group").lower()
    if node_type == "rule":
        field_key = node.get("field")
        op = (node.get("op") or "eq").lower()
        raw_value = node.get("value")
        if field_key not in field_map:
            return Q()
        path = field_map[field_key]
        value = parse_value(raw_value)
        if op == "eq":
            return Q(**{path: value})
        if op == "ne":
            return ~Q(**{path: value})
        if op == "contains":
            return Q(**{f"{path}__icontains": str(value)})
        if op == "startswith":
            return Q(**{f"{path}__istartswith": str(value)})
        if op == "endswith":
            return Q(**{f"{path}__iendswith": str(value)})
        if op == "gt":
            return Q(**{f"{path}__gt": value})
        if op == "gte":
            return Q(**{f"{path}__gte": value})
        if op == "lt":
            return Q(**{f"{path}__lt": value})
        if op == "lte":
            return Q(**{f"{path}__lte": value})
        if op == "in":
            if isinstance(value, str):
                parts = [p.strip() for p in value.split(",") if p.strip()]
            elif isinstance(value, list):
                parts = value
            else:
                parts = [value]
            return Q(**{f"{path}__in": parts})
        if op == "isnull":
            return Q(**{f"{path}__isnull": bool(value)})
        return Q()

    group_op = (node.get("op") or "and").upper()
    children = node.get("children") or node.get("items") or []
    q = Q()
    first = True
    for child in children:
        child_q = build_report_q(child, field_map)
        if first:
            q = child_q
            first = False
            continue
        if group_op == "OR":
            q = q | child_q
        else:
            q = q & child_q
    return q


class ReportDefinitionViewSet(viewsets.ModelViewSet):
    serializer_class = ReportDefinitionSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("dataset", "is_public")
    search_fields = ("name",)
    ordering_fields = ("updated_at", "created_at", "name")

    def get_queryset(self):
        qs = ReportDefinition.objects.select_related("created_by").order_by("-updated_at")
        return qs

    def perform_create(self, serializer):
        report = serializer.save(created_by=self.request.user)
        create_audit_event(actor=self.request.user, action="report.create", obj=report, summary=report.name)

    def perform_update(self, serializer):
        report = serializer.save()
        create_audit_event(actor=self.request.user, action="report.update", obj=report, summary=report.name)

    def _build_rows(self, report: ReportDefinition, *, limit: int):
        qs, field_map = report_dataset_config(report.dataset)
        selected = report.selected_fields if isinstance(report.selected_fields, list) else []
        selected = [f for f in selected if f in field_map]
        if not selected:
            selected = list(field_map.keys())[:8]

        q = build_report_q(report.conditions or {}, field_map)
        qs = qs.filter(q)

        if "updated_at" in field_map.values():
            qs = qs.order_by("-updated_at")
        else:
            qs = qs.order_by("-created_at")

        value_paths = [field_map[s] for s in selected]
        rows_dicts = list(qs.values(*value_paths)[:limit])
        rows = [[str(d.get(p, "")) for p in value_paths] for d in rows_dicts]
        return selected, rows

    @action(detail=True, methods=["post"], url_path="run")
    def run(self, request, pk=None):
        report = self.get_object()
        payload = request.data or {}
        fmt = (payload.get("format") or "json").upper()
        limit = int(payload.get("limit") or 200)
        limit = max(1, min(limit, 2000))

        headers, rows = self._build_rows(report, limit=limit)

        create_audit_event(actor=request.user, action="report.run", obj=report, summary=f"{report.name} ({fmt})")

        if fmt == "CSV":
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(headers)
            for r in rows:
                w.writerow(r)
            data = buf.getvalue().encode("utf-8")
            resp = HttpResponse(data, content_type="text/csv")
            resp["Content-Disposition"] = f'attachment; filename="{report.name}.csv"'
            return resp

        if fmt == "PDF":
            lines = [", ".join([f"{headers[i]}={r[i]}" for i in range(len(headers))]) for r in rows]
            pdf_bytes = simple_pdf(report.name, lines)
            resp = HttpResponse(pdf_bytes, content_type="application/pdf")
            resp["Content-Disposition"] = f'attachment; filename="{report.name}.pdf"'
            return resp

        if fmt == "XLSX":
            x = simple_xlsx(headers, rows)
            resp = HttpResponse(x, content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
            resp["Content-Disposition"] = f'attachment; filename="{report.name}.xlsx"'
            return resp

        return Response({"columns": headers, "rows": rows, "count": len(rows)})


class ReportScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = ReportScheduleSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("frequency", "format", "is_active", "report")
    ordering_fields = ("next_run_at", "last_run_at", "created_at")

    def get_queryset(self):
        return ReportSchedule.objects.select_related("report", "created_by").order_by("-created_at")

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        if obj.next_run_at is None:
            obj.next_run_at = timezone.now()
            obj.save(update_fields=["next_run_at"])
        create_audit_event(actor=self.request.user, action="report_schedule.create", obj=obj, summary=obj.report.name)

    @action(detail=False, methods=["post"], url_path="run-due")
    def run_due(self, request):
        now = timezone.now()
        qs = ReportSchedule.objects.filter(is_active=True).filter(Q(next_run_at__lte=now) | Q(next_run_at__isnull=True)).select_related(
            "report"
        )
        results = []
        for s in qs[:25]:
            report = s.report
            headers, rows = ReportDefinitionViewSet()._build_rows(report, limit=500)
            fmt = s.format.upper()
            if fmt == "CSV":
                buf = io.StringIO()
                w = csv.writer(buf)
                w.writerow(headers)
                for r in rows:
                    w.writerow(r)
                content = buf.getvalue().encode("utf-8")
                content_type = "text/csv"
                filename = f"{report.name}.csv"
            elif fmt == "XLSX":
                content = simple_xlsx(headers, rows)
                content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                filename = f"{report.name}.xlsx"
            else:
                lines = [", ".join([f"{headers[i]}={r[i]}" for i in range(len(headers))]) for r in rows]
                content = simple_pdf(report.name, lines)
                content_type = "application/pdf"
                filename = f"{report.name}.pdf"

            recipients = [r for r in (s.recipients or []) if isinstance(r, str) and "@" in r]
            if recipients:
                email = EmailMessage(
                    subject=f"Scheduled report: {report.name}",
                    body=f"Attached: {report.name}",
                    from_email=getattr(settings, "DEFAULT_FROM_EMAIL", None),
                    to=recipients,
                )
                email.attach(filename, content, content_type)
                email.send(fail_silently=True)

            s.last_run_at = now
            if s.frequency == ReportSchedule.Frequency.DAILY:
                s.next_run_at = now + timedelta(days=1)
            elif s.frequency == ReportSchedule.Frequency.MONTHLY:
                s.next_run_at = now + timedelta(days=30)
            else:
                s.next_run_at = now + timedelta(days=7)
            s.save(update_fields=["last_run_at", "next_run_at"])
            create_audit_event(actor=request.user, action="report_schedule.run", obj=s, summary=report.name)
            results.append({"schedule_id": str(s.id), "report_id": str(report.id), "format": s.format})
        return Response({"ran": len(results), "results": results})


def workflow_render_message(template: str, context: dict) -> str:
    out = template or ""
    for k, v in context.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def workflow_execute(*, schema: dict, input_data: dict, sandbox: bool, actor) -> tuple[dict, list[str], str | None]:
    logs: list[str] = []
    output: dict = {"applied": [], "notifications": 0}
    error: str | None = None

    ticket_id = input_data.get("ticket_id")
    ticket = None
    if ticket_id:
        ticket = Ticket.objects.select_related("assignee", "requester").filter(id=ticket_id).first()
    context = {
        "ticket_number": ticket.number if ticket else "",
        "ticket_title": ticket.title if ticket else "",
        "ticket_priority": ticket.priority if ticket else "",
        "ticket_status": ticket.status if ticket else "",
    }

    def eval_if(cond: dict) -> bool:
        if not ticket:
            return False
        field = cond.get("field")
        op = (cond.get("op") or "eq").lower()
        value = cond.get("value")
        left = getattr(ticket, field, None)
        if left is None:
            return False
        left_s = str(left)
        right_s = str(value)
        if op == "eq":
            return left_s == right_s
        if op == "ne":
            return left_s != right_s
        if op == "contains":
            return right_s.lower() in left_s.lower()
        if op == "in":
            parts = [p.strip() for p in right_s.split(",") if p.strip()]
            return left_s in parts
        return False

    def run_steps(steps: list[dict]):
        nonlocal error
        for step in steps:
            if error:
                return
            st = (step.get("type") or "").lower()
            if st == "if":
                ok = eval_if(step.get("condition") or {})
                run_steps(step.get("then") or []) if ok else run_steps(step.get("else") or [])
                continue

            if st == "notify":
                message = workflow_render_message(step.get("message") or "", context)
                channel = (step.get("channel") or "in_app").lower()
                target = (step.get("target") or "assignee").lower()
                logs.append(f"notify {channel} {target}: {message}")
                if channel in ("teams", "slack"):
                    payload = {"text": message}
                    if channel == "teams":
                        send_webhook(settings.TEAMS_WEBHOOK_URL, payload)
                    else:
                        send_webhook(settings.SLACK_WEBHOOK_URL, payload)
                    output["notifications"] += 1
                else:
                    if ticket:
                        user = ticket.assignee if target == "assignee" else ticket.requester
                        if user:
                            Notification.objects.create(
                                user=user,
                                kind=Notification.Kind.INFO,
                                title=f"Workflow: {context.get('ticket_number')}",
                                body=message,
                                link=f"/tickets/{ticket.id}",
                            )
                            output["notifications"] += 1
                continue

            if st == "set_ticket":
                if not ticket:
                    logs.append("set_ticket skipped (no ticket)")
                    continue
                field = step.get("field")
                value = step.get("value")
                if field not in {"status", "priority", "assignment_group_id", "assignee_id"}:
                    logs.append(f"set_ticket ignored (unsupported field {field})")
                    continue
                logs.append(f"set_ticket {field}={value} sandbox={sandbox}")
                if not sandbox:
                    if field == "assignment_group_id":
                        ticket.assignment_group_id = value or None
                    elif field == "assignee_id":
                        ticket.assignee_id = value or None
                    else:
                        setattr(ticket, field, value)
                    ticket.save(update_fields=[field.replace("_id", ""), "updated_at"])
                    output["applied"].append({field: value})
                continue

            logs.append(f"unknown step: {st}")

    steps = schema.get("steps") if isinstance(schema.get("steps"), list) else []
    try:
        run_steps(steps)
    except Exception as e:
        error = str(e)

    return output, logs, error


class WorkflowViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("kind", "is_active")
    search_fields = ("name",)
    ordering_fields = ("updated_at", "created_at", "name")

    def get_queryset(self):
        return Workflow.objects.select_related("created_by", "deployed_version").order_by("-updated_at")

    def perform_create(self, serializer):
        wf = serializer.save(created_by=self.request.user)
        v1 = WorkflowVersion.objects.create(workflow=wf, version=1, status=WorkflowVersion.Status.DRAFT, schema={"steps": []}, created_by=self.request.user)
        create_audit_event(actor=self.request.user, action="workflow.create", obj=wf, summary=wf.name)
        create_audit_event(actor=self.request.user, action="workflow.version.create", obj=v1, summary=str(v1.version))

    @action(detail=True, methods=["get"], url_path="versions")
    def versions(self, request, pk=None):
        wf = self.get_object()
        qs = WorkflowVersion.objects.filter(workflow=wf).select_related("created_by").order_by("-version")
        return Response(WorkflowVersionSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"], url_path="new-version")
    def new_version(self, request, pk=None):
        wf = self.get_object()
        latest = WorkflowVersion.objects.filter(workflow=wf).order_by("-version").first()
        next_version = (latest.version if latest else 0) + 1
        schema = latest.schema if latest and isinstance(latest.schema, dict) else {"steps": []}
        tests = latest.test_cases if latest and isinstance(latest.test_cases, list) else []
        v = WorkflowVersion.objects.create(workflow=wf, version=next_version, status=WorkflowVersion.Status.DRAFT, schema=schema, test_cases=tests, created_by=request.user)
        create_audit_event(actor=request.user, action="workflow.version.create", obj=v, summary=str(v.version))
        return Response(WorkflowVersionSerializer(v).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="deploy")
    def deploy(self, request, pk=None):
        wf = self.get_object()
        version_id = (request.data or {}).get("version_id")
        v = WorkflowVersion.objects.filter(workflow=wf, id=version_id).first() if version_id else WorkflowVersion.objects.filter(workflow=wf).order_by("-version").first()
        if not v:
            return Response({"detail": "Version not found."}, status=status.HTTP_404_NOT_FOUND)

        WorkflowVersion.objects.filter(workflow=wf, status=WorkflowVersion.Status.DEPLOYED).update(status=WorkflowVersion.Status.ARCHIVED)
        v.status = WorkflowVersion.Status.DEPLOYED
        v.save(update_fields=["status"])
        wf.deployed_version = v
        wf.save(update_fields=["deployed_version", "updated_at"])
        create_audit_event(actor=request.user, action="workflow.deploy", obj=wf, summary=str(v.version))
        return Response(WorkflowSerializer(wf, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="rollback")
    def rollback(self, request, pk=None):
        wf = self.get_object()
        version = int((request.data or {}).get("version") or 0)
        v = WorkflowVersion.objects.filter(workflow=wf, version=version).first()
        if not v:
            return Response({"detail": "Version not found."}, status=status.HTTP_404_NOT_FOUND)
        WorkflowVersion.objects.filter(workflow=wf, status=WorkflowVersion.Status.DEPLOYED).update(status=WorkflowVersion.Status.ARCHIVED)
        v.status = WorkflowVersion.Status.DEPLOYED
        v.save(update_fields=["status"])
        wf.deployed_version = v
        wf.save(update_fields=["deployed_version", "updated_at"])
        create_audit_event(actor=request.user, action="workflow.rollback", obj=wf, summary=str(v.version))
        return Response(WorkflowSerializer(wf, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="sandbox-run")
    def sandbox_run(self, request, pk=None):
        wf = self.get_object()
        version_id = (request.data or {}).get("version_id")
        input_data = (request.data or {}).get("input") or {}
        v = WorkflowVersion.objects.filter(workflow=wf, id=version_id).first() if version_id else wf.deployed_version
        if not v:
            v = WorkflowVersion.objects.filter(workflow=wf).order_by("-version").first()
        if not v:
            return Response({"detail": "No version."}, status=status.HTTP_400_BAD_REQUEST)

        run = WorkflowRun.objects.create(workflow_version=v, sandbox=True, input=input_data, status=WorkflowRun.Status.RUNNING)
        output, logs, error = workflow_execute(schema=v.schema if isinstance(v.schema, dict) else {}, input_data=input_data if isinstance(input_data, dict) else {}, sandbox=True, actor=request.user)
        run.output = output
        run.logs = logs
        run.status = WorkflowRun.Status.FAILED if error else WorkflowRun.Status.SUCCEEDED
        run.error = error or ""
        run.finished_at = timezone.now()
        run.save(update_fields=["output", "logs", "status", "error", "finished_at"])
        create_audit_event(actor=request.user, action="workflow.sandbox_run", obj=wf, summary=str(v.version))
        return Response(WorkflowRunSerializer(run).data)

    @action(detail=True, methods=["post"], url_path="deploy-run")
    def deploy_run(self, request, pk=None):
        wf = self.get_object()
        if not wf.deployed_version_id:
            return Response({"detail": "Workflow not deployed."}, status=status.HTTP_400_BAD_REQUEST)
        input_data = (request.data or {}).get("input") or {}
        v = wf.deployed_version
        run = WorkflowRun.objects.create(workflow_version=v, sandbox=False, input=input_data, status=WorkflowRun.Status.RUNNING)
        output, logs, error = workflow_execute(schema=v.schema if isinstance(v.schema, dict) else {}, input_data=input_data if isinstance(input_data, dict) else {}, sandbox=False, actor=request.user)
        run.output = output
        run.logs = logs
        run.status = WorkflowRun.Status.FAILED if error else WorkflowRun.Status.SUCCEEDED
        run.error = error or ""
        run.finished_at = timezone.now()
        run.save(update_fields=["output", "logs", "status", "error", "finished_at"])
        create_audit_event(actor=request.user, action="workflow.run", obj=wf, summary=str(v.version))
        return Response(WorkflowRunSerializer(run).data)

    @action(detail=True, methods=["post"], url_path="run-tests")
    def run_tests(self, request, pk=None):
        wf = self.get_object()
        version_id = (request.data or {}).get("version_id")
        v = WorkflowVersion.objects.filter(workflow=wf, id=version_id).first() if version_id else wf.deployed_version
        if not v:
            v = WorkflowVersion.objects.filter(workflow=wf).order_by("-version").first()
        if not v:
            return Response({"detail": "No version."}, status=status.HTTP_400_BAD_REQUEST)
        tests = v.test_cases if isinstance(v.test_cases, list) else []
        results = []
        for t in tests[:50]:
            input_data = t.get("input") if isinstance(t, dict) else {}
            expected = t.get("expect") if isinstance(t, dict) else {}
            out, logs, error = workflow_execute(schema=v.schema if isinstance(v.schema, dict) else {}, input_data=input_data if isinstance(input_data, dict) else {}, sandbox=True, actor=request.user)
            ok = False
            if isinstance(expected, dict):
                ok = all(out.get(k) == v2 for k, v2 in expected.items())
            results.append({"ok": ok and not error, "error": error, "output": out, "logs": logs})
        create_audit_event(actor=request.user, action="workflow.run_tests", obj=wf, summary=str(v.version))
        return Response({"count": len(results), "results": results})

    @action(detail=True, methods=["get"], url_path="runs")
    def runs(self, request, pk=None):
        wf = self.get_object()
        qs = WorkflowRun.objects.filter(workflow_version__workflow=wf).select_related("workflow_version").order_by("-started_at")[:200]
        return Response(WorkflowRunSerializer(qs, many=True).data)


class WorkflowVersionViewSet(viewsets.ModelViewSet):
    serializer_class = WorkflowVersionSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("workflow", "status")
    ordering_fields = ("version", "created_at")

    def get_queryset(self):
        return WorkflowVersion.objects.select_related("workflow", "created_by").order_by("-created_at")

    def perform_update(self, serializer):
        v = serializer.save()
        create_audit_event(actor=self.request.user, action="workflow.version.update", obj=v, summary=str(v.version))

class VirtualAgentView(APIView):
    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request):
        cfg = SystemSetting.objects.filter(key="ai_agents").first()
        cfg_value = cfg.value if cfg and isinstance(cfg.value, dict) else {}
        if cfg_value.get("enabled") is False:
            return Response({"detail": "AI Agents are disabled."}, status=status.HTTP_403_FORBIDDEN)
        max_results = int(cfg_value.get("max_results", 5))
        max_results = max(1, min(max_results, 10))

        text = ((request.data or {}).get("message") or "").strip()
        if not text:
            return Response({"detail": "message is required"}, status=status.HTTP_400_BAD_REQUEST)

        kb = (
            KnowledgeArticle.objects.filter(status=KnowledgeArticle.Status.PUBLISHED)
            .filter(Q(title__icontains=text) | Q(body__icontains=text) | Q(category__icontains=text))
            .order_by("-updated_at")[:max_results]
        )
        catalog = (
            CatalogItem.objects.filter(is_active=True)
            .filter(Q(name__icontains=text) | Q(description__icontains=text) | Q(category__icontains=text))
            .order_by("category", "name")[:max_results]
        )

        return Response(
            {
                "message": f"I found {kb.count()} knowledge articles and {catalog.count()} catalog items that may help.",
                "knowledge": [{"id": str(a.id), "title": a.title, "category": a.category} for a in kb],
                "catalog": [{"id": str(i.id), "name": i.name, "category": i.category} for i in catalog],
            }
        )


class PasswordResetRequestView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        identifier = ((request.data or {}).get("email") or "").strip().lower()
        response_base = {"detail": "If the account exists, a reset link has been sent."}

        if not identifier:
            return Response(response_base, status=status.HTTP_200_OK)

        user = User.objects.filter(email__iexact=identifier).first()
        if not user:
            user = User.objects.filter(username__iexact=identifier).first()

        if not user or not user.email:
            return Response(response_base, status=status.HTTP_200_OK)

        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password/{uid}/{token}"

        subject = "Reset your password"
        body = f"Use this link to reset your password:\n\n{reset_url}\n\nIf you did not request this, you can ignore this email."
        send_mail(subject, body, settings.DEFAULT_FROM_EMAIL, [user.email], fail_silently=True)

        if settings.DEBUG:
            return Response({**response_base, "debug_reset_url": reset_url})
        return Response(response_base, status=status.HTTP_200_OK)


class PasswordResetConfirmView(APIView):
    permission_classes = (permissions.AllowAny,)

    def post(self, request):
        uid = ((request.data or {}).get("uid") or "").strip()
        token = ((request.data or {}).get("token") or "").strip()
        new_password = (request.data or {}).get("new_password") or ""

        if not uid or not token or not new_password:
            return Response({"detail": "uid, token and new_password are required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
        except Exception:
            return Response({"detail": "Invalid reset link."}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.filter(pk=user_id).first()
        if not user:
            return Response({"detail": "Invalid reset link."}, status=status.HTTP_400_BAD_REQUEST)

        if not default_token_generator.check_token(user, token):
            return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_password(new_password, user=user)
        except Exception as e:
            details = getattr(e, "messages", None) or [str(e)]
            return Response({"detail": details}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(new_password)
        user.save(update_fields=["password"])
        create_audit_event(actor=user, action="auth.password_reset", obj=user, summary="password reset")
        return Response({"detail": "Password has been reset."})


class TeamViewSet(viewsets.ModelViewSet):
    queryset = Team.objects.all().order_by("name")
    serializer_class = TeamSerializer
    filterset_fields = ("is_active",)
    search_fields = ("name", "email")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (IsAgent(),)
        return (IsPrivileged(),)


class TicketViewSet(viewsets.ModelViewSet):
    serializer_class = TicketSerializer
    permission_classes = (permissions.IsAuthenticated,)
    filterset_fields = ("kind", "status", "priority", "assignee", "assignment_group")
    ordering_fields = ("created_at", "updated_at", "due_at", "priority")
    search_fields = ("number", "title", "description", "resolution_summary")

    def get_queryset(self):
        qs = Ticket.objects.select_related("requester", "assignee", "assignment_group", "affected_service").prefetch_related(
            "comments", "approvals"
        )
        user = self.request.user
        is_agent = bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser or user.groups.filter(name__in=["ITSM_AGENT", "ITSM_ADMIN"]).exists())
        )
        if is_agent:
            return qs.order_by("-created_at")
        return qs.filter(requester=user).order_by("-created_at")

    def perform_create(self, serializer):
        user = self.request.user
        is_agent = bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser or user.groups.filter(name__in=["ITSM_AGENT", "ITSM_ADMIN"]).exists())
        )
        if not is_agent:
            kind = serializer.validated_data.get("kind", Ticket.Kind.INCIDENT)
            if kind not in (Ticket.Kind.INCIDENT, Ticket.Kind.SERVICE_REQUEST):
                raise PermissionDenied("Only agents can create problems and changes.")

        due_at = serializer.validated_data.get("due_at")
        if due_at is None:
            kind = serializer.validated_data.get("kind", Ticket.Kind.INCIDENT)
            priority = serializer.validated_data.get("priority", Ticket.Priority.P3)
            policy = SlaPolicy.objects.filter(is_active=True, kind=kind, priority=priority).first()
            if policy:
                minutes = policy.resolution_minutes
            else:
                if priority == Ticket.Priority.P1:
                    minutes = 60
                elif priority == Ticket.Priority.P2:
                    minutes = 180
                elif priority == Ticket.Priority.P3:
                    minutes = 480
                else:
                    minutes = 1440
            due_at = timezone.now() + timedelta(minutes=minutes)

        save_kwargs = {"requester": user, "due_at": due_at}
        if not is_agent:
            save_kwargs["assignee"] = None
            save_kwargs["assignment_group"] = None
            save_kwargs["affected_service"] = None
            save_kwargs["status"] = Ticket.Status.NEW
        ticket = serializer.save(**save_kwargs)
        create_audit_event(actor=self.request.user, action="ticket.create", obj=ticket, summary=ticket.title)

    @action(detail=True, methods=["get", "post"], url_path="comments")
    def comments(self, request, pk=None):
        ticket = self.get_object()
        if request.method == "GET":
            serializer = TicketCommentSerializer(ticket.comments.select_related("author").order_by("created_at"), many=True)
            return Response(serializer.data)

        serializer = TicketCommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = TicketComment.objects.create(
            ticket=ticket, author=request.user, body=serializer.validated_data["body"]
        )
        return Response(TicketCommentSerializer(comment).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="close")
    def close(self, request, pk=None):
        ticket = self.get_object()
        ticket.status = Ticket.Status.CLOSED
        ticket.closed_at = timezone.now()
        ticket.save(update_fields=["status", "closed_at", "updated_at"])
        create_audit_event(actor=request.user, action="ticket.close", obj=ticket, summary=ticket.title)
        return Response(TicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="assign-to-me", permission_classes=(IsAgent,))
    def assign_to_me(self, request, pk=None):
        ticket = self.get_object()
        ticket.assignee = request.user
        if ticket.status == Ticket.Status.NEW:
            ticket.status = Ticket.Status.IN_PROGRESS
        ticket.save(update_fields=["assignee", "status", "updated_at"])
        create_audit_event(actor=request.user, action="ticket.assign_to_me", obj=ticket, summary=ticket.title)
        return Response(TicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="set-status", permission_classes=(IsAgent,))
    def set_status(self, request, pk=None):
        ticket = self.get_object()
        new_status = (request.data or {}).get("status")
        valid = {c[0] for c in Ticket.Status.choices}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        ticket.status = new_status
        now = timezone.now()
        if new_status in (Ticket.Status.CLOSED, Ticket.Status.CANCELED):
            ticket.closed_at = now
            ticket.save(update_fields=["status", "closed_at", "updated_at"])
        else:
            ticket.save(update_fields=["status", "updated_at"])
        create_audit_event(actor=request.user, action="ticket.set_status", obj=ticket, summary=new_status)

        if new_status in (Ticket.Status.RESOLVED, Ticket.Status.CLOSED) and ticket.assignee_id and ticket.due_at:
            if now <= ticket.due_at:
                cfg = SystemSetting.objects.filter(key="gamification").first()
                cfg_value = cfg.value if cfg and isinstance(cfg.value, dict) else {}
                base = 50
                if ticket.priority == Ticket.Priority.P1:
                    base = int(cfg_value.get("points_sla_p1", 50))
                elif ticket.priority == Ticket.Priority.P2:
                    base = int(cfg_value.get("points_sla_p2", 30))
                elif ticket.priority == Ticket.Priority.P3:
                    base = int(cfg_value.get("points_sla_p3", 20))
                else:
                    base = int(cfg_value.get("points_sla_p4", 15))
                PointEvent.objects.create(user=ticket.assignee, ticket=ticket, points=base, reason="SLA_RESOLVE")
                create_audit_event(actor=request.user, action="gamification.points", obj=ticket, summary=f"{ticket.assignee.username} +{base}")
                payload = {"text": f"{ticket.assignee.username} earned {base} points for resolving {ticket.number} within SLA."}
                teams_url, slack_url = get_global_webhooks()
                send_webhook(teams_url, payload)
                send_webhook(slack_url, payload)

        return Response(TicketSerializer(ticket, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="approve", permission_classes=(IsAgent,))
    def approve(self, request, pk=None):
        ticket = self.get_object()
        serializer = TicketApprovalInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approver = request.user
        approval, _ = TicketApproval.objects.get_or_create(ticket=ticket, approver=approver)
        approval.status = serializer.validated_data.get("status", approval.status)
        approval.comment = serializer.validated_data.get("comment", approval.comment)
        approval.responded_at = timezone.now()
        approval.save(update_fields=["status", "comment", "responded_at"])
        Notification.objects.create(
            user=ticket.requester,
            kind=Notification.Kind.APPROVAL,
            title=f"{ticket.number} approval {approval.status.lower()}",
            body=approval.comment or "",
            link=f"/tickets/{ticket.id}",
        )
        create_audit_event(actor=request.user, action="ticket.approval", obj=ticket, summary=approval.status)
        return Response(TicketApprovalSerializer(approval).data)

    @action(detail=True, methods=["get"], url_path="recommendations", permission_classes=(IsAgent,))
    def recommendations(self, request, pk=None):
        ticket = self.get_object()
        text = f"{ticket.title}\n{ticket.description}\n{ticket.category}\n{ticket.subcategory}".lower()
        team_map = [
            ("network", "Network"),
            ("vpn", "Network"),
            ("wifi", "Network"),
            ("router", "Network"),
            ("email", "Service Desk"),
            ("password", "Service Desk"),
            ("account", "Service Desk"),
            ("laptop", "Service Desk"),
            ("device", "Service Desk"),
        ]
        suggested_group = None
        for needle, team_name in team_map:
            if needle in text:
                suggested_group = Team.objects.filter(name__iexact=team_name).first()
                break

        kb = (
            KnowledgeArticle.objects.filter(status=KnowledgeArticle.Status.PUBLISHED)
            .filter(Q(title__icontains=ticket.title) | Q(body__icontains=ticket.title) | Q(body__icontains=ticket.category))
            .order_by("-updated_at")[:5]
        )
        kb_list = [{"id": str(a.id), "title": a.title, "category": a.category} for a in kb]

        return Response(
            {
                "suggested_assignment_group_id": str(suggested_group.id) if suggested_group else None,
                "suggested_assignment_group_name": suggested_group.name if suggested_group else None,
                "knowledge": kb_list,
            }
        )

    @action(detail=True, methods=["get"], url_path="impact")
    def impact(self, request, pk=None):
        ticket = self.get_object()
        if not ticket.affected_service_id:
            return Response({"services": [], "assets": []})
        service = ticket.affected_service
        services = {service.id: service}
        assets = {}
        frontier = [service]
        depth = 0
        while frontier and depth < 3:
            depth += 1
            next_frontier = []
            rels = ServiceRelationship.objects.filter(source_service__in=[s.id for s in frontier]).select_related(
                "target_service", "target_asset"
            )
            for r in rels:
                if r.target_service_id and r.target_service_id not in services:
                    services[r.target_service_id] = r.target_service
                    next_frontier.append(r.target_service)
                if r.target_asset_id and r.target_asset_id not in assets:
                    assets[r.target_asset_id] = r.target_asset
            frontier = next_frontier

        return Response(
            {
                "services": [{"id": str(s.id), "name": s.name} for s in services.values()],
                "assets": [{"id": str(a.id), "asset_tag": a.asset_tag, "name": a.name} for a in assets.values()],
            }
        )

    @action(detail=True, methods=["get", "post"], url_path="war-room")
    def war_room(self, request, pk=None):
        ticket = self.get_object()
        if ticket.kind != Ticket.Kind.INCIDENT:
            return Response({"detail": "War room is only available for incidents."}, status=status.HTTP_400_BAD_REQUEST)

        wr, created = WarRoom.objects.get_or_create(ticket=ticket, defaults={"created_by": request.user})
        if created:
            create_audit_event(actor=request.user, action="war_room.create", obj=wr, summary=ticket.number)

        if request.user.is_staff or ticket.requester_id == request.user.id:
            role = WarRoomParticipant.Role.AGENT if request.user.is_staff else WarRoomParticipant.Role.OBSERVER
            WarRoomParticipant.objects.get_or_create(war_room=wr, user=request.user, defaults={"role": role})
            create_audit_event(actor=request.user, action="war_room.join", obj=wr, summary=request.user.username)
        else:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "POST" and request.user.is_staff:
            payload = request.data or {}
            update = {}
            if "slack_webhook_url" in payload:
                update["slack_webhook_url"] = payload.get("slack_webhook_url") or ""
            if "teams_webhook_url" in payload:
                update["teams_webhook_url"] = payload.get("teams_webhook_url") or ""
            if update:
                for k, v in update.items():
                    setattr(wr, k, v)
                wr.save(update_fields=list(update.keys()) + ["updated_at"])
                create_audit_event(actor=request.user, action="war_room.update_integrations", obj=wr, summary=ticket.number)

        return Response(WarRoomSerializer(wr, context={"request": request}).data)


class WarRoomViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = WarRoomSerializer
    permission_classes = (permissions.IsAuthenticated,)

    def get_queryset(self):
        qs = WarRoom.objects.select_related("ticket", "created_by").prefetch_related("participants__user").order_by("-updated_at")
        if self.request.user.is_staff:
            return qs
        return qs.filter(ticket__requester=self.request.user)

    def _can_access(self, request, wr: WarRoom) -> bool:
        if request.user.is_staff:
            return True
        return wr.ticket.requester_id == request.user.id

    @action(detail=True, methods=["get", "post"], url_path="messages")
    def messages(self, request, pk=None):
        wr = self.get_object()
        if not self._can_access(request, wr):
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "GET":
            qs = WarRoomMessage.objects.filter(war_room=wr).select_related("author", "parent").order_by("created_at")
            return Response(WarRoomMessageSerializer(qs, many=True).data)

        serializer = WarRoomMessageSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        parent = serializer.validated_data.get("parent")
        if parent and parent.war_room_id != wr.id:
            return Response({"detail": "Invalid parent."}, status=status.HTTP_400_BAD_REQUEST)

        msg = WarRoomMessage.objects.create(
            war_room=wr,
            author=request.user,
            body=serializer.validated_data["body"],
            parent=parent,
        )
        create_audit_event(actor=request.user, action="war_room.message", obj=wr, summary=request.user.username)

        payload = {"text": f"[{wr.ticket.number}] {request.user.username}: {msg.body[:350]}"}
        send_webhook(wr.slack_webhook_url, payload)
        send_webhook(wr.teams_webhook_url, payload)
        return Response(WarRoomMessageSerializer(msg).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="export.csv")
    def export_csv(self, request, pk=None):
        wr = self.get_object()
        if not request.user.is_staff:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["timestamp", "author", "parent_id", "message"])
        qs = WarRoomMessage.objects.filter(war_room=wr).select_related("author", "parent").order_by("created_at")
        for m in qs:
            w.writerow([m.created_at.isoformat(), m.author.username if m.author_id else m.guest_name, str(m.parent_id) if m.parent_id else "", m.body])
        data = buf.getvalue().encode("utf-8")
        create_audit_event(actor=request.user, action="war_room.export_csv", obj=wr, summary=wr.ticket.number)
        resp = HttpResponse(data, content_type="text/csv")
        resp["Content-Disposition"] = f'attachment; filename="{wr.ticket.number}-war-room.csv"'
        return resp

    @action(detail=True, methods=["get"], url_path="export.pdf")
    def export_pdf(self, request, pk=None):
        wr = self.get_object()
        if not request.user.is_staff:
            return Response({"detail": "Not allowed."}, status=status.HTTP_403_FORBIDDEN)

        qs = WarRoomMessage.objects.filter(war_room=wr).select_related("author", "parent").order_by("created_at")
        lines = []
        for m in qs:
            author = m.author.username if m.author_id else m.guest_name
            prefix = "↳ " if m.parent_id else ""
            lines.append(f"{m.created_at.isoformat()} {prefix}{author}: {m.body}")
        pdf_bytes = simple_pdf(f"{wr.ticket.number} War Room Log", lines)
        create_audit_event(actor=request.user, action="war_room.export_pdf", obj=wr, summary=wr.ticket.number)
        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{wr.ticket.number}-war-room.pdf"'
        return resp

    @action(detail=True, methods=["post"], url_path="guest-link", permission_classes=(IsAgent,))
    def guest_link(self, request, pk=None):
        wr = self.get_object()
        url = f"{settings.FRONTEND_BASE_URL}/guest/war-room/{wr.id}/{wr.guest_token}"
        create_audit_event(actor=request.user, action="war_room.guest_link", obj=wr, summary=wr.ticket.number)
        return Response({"url": url})

    @action(detail=True, methods=["get"], url_path=r"guest/(?P<token>[^/.]+)/overview", permission_classes=(permissions.AllowAny,))
    def guest_overview(self, request, pk=None, token=None):
        wr = self.get_object()
        if str(wr.guest_token) != str(token):
            return Response({"detail": "Invalid guest token."}, status=status.HTTP_403_FORBIDDEN)
        return Response(WarRoomSerializer(wr, context={"request": request}).data)

    @action(detail=True, methods=["get", "post"], url_path=r"guest/(?P<token>[^/.]+)/messages", permission_classes=(permissions.AllowAny,))
    def guest_messages(self, request, pk=None, token=None):
        wr = self.get_object()
        if str(wr.guest_token) != str(token):
            return Response({"detail": "Invalid guest token."}, status=status.HTTP_403_FORBIDDEN)

        if request.method == "GET":
            qs = WarRoomMessage.objects.filter(war_room=wr).select_related("author", "parent").order_by("created_at")
            return Response(WarRoomMessageSerializer(qs, many=True).data)

        body = ((request.data or {}).get("body") or "").strip()
        guest_name = ((request.data or {}).get("guest_name") or "").strip()[:120]
        parent_id = (request.data or {}).get("parent_id")
        parent = None
        if parent_id:
            parent = WarRoomMessage.objects.filter(id=parent_id, war_room=wr).first()
        if not body:
            return Response({"detail": "body is required."}, status=status.HTTP_400_BAD_REQUEST)
        if not guest_name:
            guest_name = "Guest"

        msg = WarRoomMessage.objects.create(war_room=wr, guest_name=guest_name, body=body, parent=parent)
        create_audit_event(actor=None, action="war_room.guest_message", obj=wr, summary=guest_name, data={"guest_name": guest_name})

        payload = {"text": f"[{wr.ticket.number}] {guest_name}: {msg.body[:350]}"}
        send_webhook(wr.slack_webhook_url, payload)
        send_webhook(wr.teams_webhook_url, payload)
        return Response(WarRoomMessageSerializer(msg).data, status=status.HTTP_201_CREATED)


class KnowledgeArticleViewSet(viewsets.ModelViewSet):
    serializer_class = KnowledgeArticleSerializer
    filterset_fields = ("status", "category")
    ordering_fields = ("created_at", "updated_at", "published_at", "title")
    search_fields = ("title", "body", "category")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsAgent(),)

    def get_queryset(self):
        qs = KnowledgeArticle.objects.select_related("author").annotate(
            rating_avg=Avg("feedback__rating"), rating_count=Count("feedback")
        )
        if self.request.user.is_staff:
            return qs.order_by("-updated_at")
        return qs.filter(status=KnowledgeArticle.Status.PUBLISHED).order_by("-updated_at")

    def perform_create(self, serializer):
        instance = serializer.save(author=self.request.user)
        if instance.status == KnowledgeArticle.Status.PUBLISHED and instance.published_at is None:
            instance.published_at = timezone.now()
            instance.save(update_fields=["published_at"])
            UserBadge.objects.get_or_create(user=instance.author, key="knowledge_contributor", defaults={"title": "Knowledge Contributor"})
            cfg = SystemSetting.objects.filter(key="gamification").first()
            cfg_value = cfg.value if cfg and isinstance(cfg.value, dict) else {}
            points = int(cfg_value.get("points_knowledge_publish", 15))
            PointEvent.objects.create(user=instance.author, ticket=None, points=points, reason="KNOWLEDGE_PUBLISH")
            payload = {"text": f"{instance.author.username} earned {points} points for publishing knowledge: {instance.title}"}
            teams_url, slack_url = get_global_webhooks()
            send_webhook(teams_url, payload)
            send_webhook(slack_url, payload)

    def perform_update(self, serializer):
        instance = serializer.save()
        if instance.status == KnowledgeArticle.Status.PUBLISHED and instance.published_at is None:
            instance.published_at = timezone.now()
            instance.save(update_fields=["published_at"])
            UserBadge.objects.get_or_create(user=instance.author, key="knowledge_contributor", defaults={"title": "Knowledge Contributor"})
            cfg = SystemSetting.objects.filter(key="gamification").first()
            cfg_value = cfg.value if cfg and isinstance(cfg.value, dict) else {}
            points = int(cfg_value.get("points_knowledge_publish", 15))
            PointEvent.objects.create(user=instance.author, ticket=None, points=points, reason="KNOWLEDGE_PUBLISH")
            payload = {"text": f"{instance.author.username} earned {points} points for publishing knowledge: {instance.title}"}
            teams_url, slack_url = get_global_webhooks()
            send_webhook(teams_url, payload)
            send_webhook(slack_url, payload)
        create_audit_event(actor=self.request.user, action="knowledge.update", obj=instance, summary=instance.title)

    @action(detail=True, methods=["get", "post"], url_path="feedback")
    def feedback(self, request, pk=None):
        article = self.get_object()
        if request.method == "GET":
            qs = KnowledgeFeedback.objects.filter(article=article).select_related("user").order_by("-created_at")[:100]
            return Response(KnowledgeFeedbackSerializer(qs, many=True).data)

        serializer = KnowledgeFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fb, _ = KnowledgeFeedback.objects.update_or_create(
            article=article,
            user=request.user,
            defaults={
                "rating": serializer.validated_data["rating"],
                "helpful": serializer.validated_data.get("helpful", True),
                "comment": serializer.validated_data.get("comment", ""),
            },
        )
        create_audit_event(actor=request.user, action="knowledge.feedback", obj=article, summary=str(fb.rating))
        return Response(KnowledgeFeedbackSerializer(fb).data, status=status.HTTP_201_CREATED)


class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.select_related("owner").order_by("asset_tag")
    serializer_class = AssetSerializer
    permission_classes = (IsAgent,)
    filterset_fields = ("status", "owner")
    ordering_fields = ("asset_tag", "name", "updated_at")
    search_fields = ("asset_tag", "name", "serial_number", "vendor", "model")

    @action(detail=False, methods=["get"], url_path="by-tag")
    def by_tag(self, request):
        tag = (request.query_params.get("asset_tag") or "").strip()
        if not tag:
            return Response({"detail": "asset_tag is required"}, status=status.HTTP_400_BAD_REQUEST)
        asset = Asset.objects.select_related("owner").filter(asset_tag__iexact=tag).first()
        if not asset:
            return Response({"detail": "Not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(AssetSerializer(asset).data)

    @action(detail=True, methods=["get"], url_path="barcode.svg")
    def barcode_svg(self, request, pk=None):
        asset = self.get_object()
        tpl_name = (request.query_params.get("template") or "").strip()
        tpl = BarcodeTemplate.objects.filter(is_active=True, name=tpl_name).first() if tpl_name else None
        template = tpl.template if tpl and isinstance(tpl.template, dict) else {}
        show_fields = template.get("show_fields") if isinstance(template.get("show_fields"), list) else ["asset_tag", "name", "owner", "location"]
        show_fields = [str(x) for x in show_fields][:6]

        bar_svg, bar_width = code39_svg(asset.asset_tag, height=80)
        lines = []
        for key in show_fields:
            if key == "asset_tag":
                lines.append(f"Tag: {asset.asset_tag}")
            elif key == "name":
                lines.append(f"Name: {asset.name}")
            elif key == "owner":
                lines.append(f"Owner: {asset.owner.username if asset.owner_id else '—'}")
            elif key == "location":
                lines.append(f"Location: {asset.location or '—'}")
            elif key == "serial_number":
                lines.append(f"Serial: {asset.serial_number or '—'}")

        def esc(s: str) -> str:
            return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

        width = max(360, bar_width + 20)
        y = 100
        text_nodes = []
        for ln in lines:
            text_nodes.append(f"<text x='10' y='{y}' font-size='12' fill='#0b0f18' font-family='Arial, sans-serif'>{esc(ln)}</text>")
            y += 16
        svg = (
            f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{y + 10}' viewBox='0 0 {width} {y + 10}'>"
            f"<rect width='{width}' height='{y + 10}' fill='white'/>"
            f"<g transform='translate(10,10)'>{bar_svg}</g>"
            + "".join(text_nodes)
            + "</svg>"
        )
        create_audit_event(actor=request.user, action="asset.barcode_svg", obj=asset, summary=asset.asset_tag)
        return HttpResponse(svg, content_type="image/svg+xml")

    @action(detail=True, methods=["get"], url_path="barcode.pdf")
    def barcode_pdf(self, request, pk=None):
        asset = self.get_object()
        pdf_bytes = code39_pdf(asset.asset_tag)
        create_audit_event(actor=request.user, action="asset.barcode_pdf", obj=asset, summary=asset.asset_tag)
        resp = HttpResponse(pdf_bytes, content_type="application/pdf")
        resp["Content-Disposition"] = f'attachment; filename="{asset.asset_tag}.pdf"'
        return resp

    @action(detail=True, methods=["get", "post"], url_path="transactions")
    def transactions(self, request, pk=None):
        asset = self.get_object()
        if request.method == "GET":
            qs = AssetTransaction.objects.filter(asset=asset).select_related("performed_by").order_by("-performed_at")[:200]
            return Response(AssetTransactionSerializer(qs, many=True).data)

        payload = request.data or {}
        action_value = payload.get("action")
        if action_value not in {a[0] for a in AssetTransaction.Action.choices}:
            return Response({"detail": "Invalid action."}, status=status.HTTP_400_BAD_REQUEST)
        notes = payload.get("notes") or ""
        tx = AssetTransaction.objects.create(asset=asset, action=action_value, performed_by=request.user, notes=notes)
        if action_value == AssetTransaction.Action.CHECK_OUT:
            asset.status = Asset.Status.IN_USE
        elif action_value == AssetTransaction.Action.CHECK_IN:
            asset.status = Asset.Status.IN_STOCK
        asset.save(update_fields=["status", "updated_at"])
        create_audit_event(actor=request.user, action="asset.transaction", obj=asset, summary=action_value, data={"notes": notes})
        return Response(AssetTransactionSerializer(tx).data, status=status.HTTP_201_CREATED)


class BarcodeTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = BarcodeTemplateSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("is_active",)
    search_fields = ("name",)
    ordering_fields = ("updated_at", "name", "created_at")

    def get_queryset(self):
        return BarcodeTemplate.objects.select_related("created_by").order_by("-updated_at")

    def perform_create(self, serializer):
        tpl = serializer.save(created_by=self.request.user)
        create_audit_event(actor=self.request.user, action="barcode_template.create", obj=tpl, summary=tpl.name)

    def perform_update(self, serializer):
        tpl = serializer.save()
        create_audit_event(actor=self.request.user, action="barcode_template.update", obj=tpl, summary=tpl.name)


class AssetMetricViewSet(viewsets.ModelViewSet):
    serializer_class = AssetMetricSerializer
    permission_classes = (IsAgent,)
    filterset_fields = ("asset",)
    ordering_fields = ("captured_at", "created_at")

    def get_queryset(self):
        return AssetMetric.objects.select_related("asset").order_by("-captured_at")

    def perform_create(self, serializer):
        metric = serializer.save()
        asset = metric.asset
        recent = AssetMetric.objects.filter(asset=asset).order_by("-captured_at")[:20]
        cpu_vals = [m.cpu_pct for m in recent if m.cpu_pct is not None]
        mem_vals = [m.memory_pct for m in recent if m.memory_pct is not None]
        cpu = metric.cpu_pct
        mem = metric.memory_pct

        def avg(vals):
            return sum(vals) / len(vals) if vals else None

        cpu_avg = avg(cpu_vals)
        mem_avg = avg(mem_vals)

        alerts = []
        if cpu is not None and (cpu >= 90 or (cpu_avg is not None and cpu >= cpu_avg + 30)):
            alerts.append(("CPU_ANOMALY", AssetAlert.Severity.CRITICAL if cpu >= 95 else AssetAlert.Severity.WARNING, f"CPU anomaly: {cpu:.0f}%"))
        if mem is not None and (mem >= 90 or (mem_avg is not None and mem >= mem_avg + 30)):
            alerts.append(("MEMORY_ANOMALY", AssetAlert.Severity.CRITICAL if mem >= 95 else AssetAlert.Severity.WARNING, f"Memory anomaly: {mem:.0f}%"))

        for kind, severity, msg in alerts:
            existing = AssetAlert.objects.filter(asset=asset, kind=kind, is_open=True).first()
            if existing:
                continue
            alert = AssetAlert.objects.create(asset=asset, kind=kind, severity=severity, message=msg)
            create_audit_event(actor=self.request.user, action="asset.alert", obj=asset, summary=kind, data={"severity": severity})
            if asset.owner_id:
                Notification.objects.create(
                    user=asset.owner,
                    kind=Notification.Kind.INFO,
                    title=f"Asset alert: {asset.asset_tag}",
                    body=msg,
                    link="/assets",
                )

        if asset.warranty_expires_on:
            days = (asset.warranty_expires_on - timezone.now().date()).days
            if days <= 30:
                AssetRecommendation.objects.get_or_create(
                    asset=asset,
                    kind="WARRANTY_EXPIRING",
                    defaults={"message": f"Warranty expires in {max(0, days)} days. Plan replacement/renewal."},
                )

    @action(detail=False, methods=["post"], url_path="ingest")
    def ingest(self, request):
        payload = request.data or {}
        items = payload.get("items") if isinstance(payload, dict) else None
        if not isinstance(items, list) or len(items) == 0:
            return Response({"detail": "items is required"}, status=status.HTTP_400_BAD_REQUEST)
        created = 0
        for it in items[:200]:
            try:
                asset_id = it.get("asset")
                asset = Asset.objects.filter(id=asset_id).first()
                if not asset:
                    continue
                captured_at = it.get("captured_at")
                ts = timezone.now() if not captured_at else datetime.fromisoformat(str(captured_at).replace("Z", "+00:00"))
                AssetMetric.objects.create(
                    asset=asset,
                    captured_at=ts,
                    cpu_pct=it.get("cpu_pct"),
                    memory_pct=it.get("memory_pct"),
                    temperature_c=it.get("temperature_c"),
                    data=it.get("data") if isinstance(it.get("data"), dict) else {},
                )
                created += 1
            except Exception:
                continue
        return Response({"created": created})


class AssetAlertViewSet(viewsets.ModelViewSet):
    serializer_class = AssetAlertSerializer
    permission_classes = (IsAgent,)
    filterset_fields = ("asset", "kind", "severity", "is_open")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return AssetAlert.objects.select_related("asset").order_by("-created_at")

    @action(detail=True, methods=["post"], url_path="resolve")
    def resolve(self, request, pk=None):
        alert = self.get_object()
        if not alert.is_open:
            return Response(AssetAlertSerializer(alert).data)
        alert.is_open = False
        alert.resolved_at = timezone.now()
        alert.save(update_fields=["is_open", "resolved_at"])
        create_audit_event(actor=request.user, action="asset.alert_resolve", obj=alert.asset, summary=alert.kind)
        return Response(AssetAlertSerializer(alert).data)


class AssetRecommendationViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AssetRecommendationSerializer
    permission_classes = (IsAgent,)
    filterset_fields = ("asset", "kind")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return AssetRecommendation.objects.select_related("asset").order_by("-created_at")


class AssetAnalyticsView(APIView):
    permission_classes = (IsAgent,)

    def get(self, request):
        now = timezone.now()
        day_ago = now - timedelta(days=1)
        open_alerts = AssetAlert.objects.filter(is_open=True)
        critical = open_alerts.filter(severity=AssetAlert.Severity.CRITICAL).count()
        metrics = AssetMetric.objects.filter(captured_at__gte=day_ago)
        total_metrics = metrics.count()
        recs = AssetRecommendation.objects.all().order_by("-created_at")[:50]
        return Response(
            {
                "open_alerts": open_alerts.count(),
                "critical_alerts": critical,
                "metrics_last_24h": total_metrics,
                "recommendations": AssetRecommendationSerializer(recs, many=True).data,
            }
        )


class DynamicFormViewSet(viewsets.ModelViewSet):
    serializer_class = DynamicFormSerializer
    filterset_fields = ("status", "record_type")
    ordering_fields = ("created_at", "updated_at", "name")
    search_fields = ("name", "description", "record_type")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        qs = DynamicForm.objects.all().order_by("-updated_at")
        if self.request.user.is_staff:
            return qs
        return qs.filter(status=DynamicForm.Status.PUBLISHED)

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, updated_by=self.request.user)

    def perform_update(self, serializer):
        instance = serializer.save(updated_by=self.request.user)
        if instance.status == DynamicForm.Status.PUBLISHED:
            instance.version = max(1, instance.version) + 1
            instance.save(update_fields=["version"])

    @action(detail=True, methods=["post"], url_path="publish", permission_classes=(IsAgent,))
    def publish(self, request, pk=None):
        form = self.get_object()
        form.status = DynamicForm.Status.PUBLISHED
        form.version = max(1, form.version) + 1
        form.updated_by = request.user
        form.save(update_fields=["status", "version", "updated_by", "updated_at"])
        create_audit_event(actor=request.user, action="form.publish", obj=form, summary=form.name)
        return Response(DynamicFormSerializer(form).data)


class CatalogItemViewSet(viewsets.ModelViewSet):
    serializer_class = CatalogItemSerializer
    filterset_fields = ("is_active", "category", "requires_approval")
    search_fields = ("name", "description", "category")
    ordering_fields = ("updated_at", "name", "created_at")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        qs = CatalogItem.objects.select_related("form").order_by("category", "name")
        if self.request.user.is_staff:
            return qs
        return qs.filter(is_active=True)

    def perform_create(self, serializer):
        item = serializer.save()
        create_audit_event(actor=self.request.user, action="catalog_item.create", obj=item, summary=item.name)

    def perform_update(self, serializer):
        item = serializer.save()
        create_audit_event(actor=self.request.user, action="catalog_item.update", obj=item, summary=item.name)


class CatalogRequestViewSet(viewsets.ModelViewSet):
    serializer_class = CatalogRequestSerializer
    permission_classes = (permissions.IsAuthenticated,)
    filterset_fields = ("status", "item", "ticket", "requester")
    ordering_fields = ("requested_at", "updated_at")

    def get_queryset(self):
        qs = CatalogRequest.objects.select_related("item", "requester", "ticket").order_by("-requested_at")
        user = self.request.user
        is_agent = bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser or user.groups.filter(name__in=["ITSM_AGENT", "ITSM_ADMIN"]).exists())
        )
        if is_agent:
            return qs
        return qs.filter(requester=user)

    def perform_create(self, serializer):
        item = serializer.validated_data["item"]
        req = serializer.save(requester=self.request.user)
        ticket = Ticket.objects.create(
            kind=Ticket.Kind.SERVICE_REQUEST,
            title=item.name,
            description=item.description,
            requester=self.request.user,
            priority=Ticket.Priority.P3,
            status=Ticket.Status.NEW,
        )
        req.ticket = ticket
        req.save(update_fields=["ticket"])
        if item.requires_approval:
            approver = (
                User.objects.filter(groups__name__in=["ITSM_AGENT", "ITSM_ADMIN"]).distinct().order_by("id").first()
                or User.objects.filter(is_staff=True).order_by("id").first()
            )
            if approver:
                TicketApproval.objects.get_or_create(ticket=ticket, approver=approver)
                Notification.objects.create(
                    user=approver,
                    kind=Notification.Kind.APPROVAL,
                    title=f"Approval requested: {ticket.number}",
                    body=ticket.title,
                    link=f"/tickets/{ticket.id}",
                )
        create_audit_event(actor=self.request.user, action="catalog_request.create", obj=req, summary=item.name)

    @action(detail=True, methods=["post"], url_path="set-status", permission_classes=(IsAgent,))
    def set_status(self, request, pk=None):
        req = self.get_object()
        new_status = (request.data or {}).get("status")
        valid = {c[0] for c in CatalogRequest.Status.choices}
        if new_status not in valid:
            return Response({"detail": "Invalid status."}, status=status.HTTP_400_BAD_REQUEST)
        req.status = new_status
        if new_status in (CatalogRequest.Status.APPROVED, CatalogRequest.Status.REJECTED):
            req.approved_by = request.user
            req.approved_at = timezone.now()
            req.save(update_fields=["status", "approved_by", "approved_at", "updated_at"])
        else:
            req.save(update_fields=["status", "updated_at"])
        Notification.objects.create(
            user=req.requester,
            kind=Notification.Kind.INFO,
            title=f"Request {req.id} updated",
            body=f"Status: {req.status}",
            link=f"/requests",
        )
        create_audit_event(actor=request.user, action="catalog_request.status", obj=req, summary=req.status)
        return Response(CatalogRequestSerializer(req, context={"request": request}).data)


class NotificationViewSet(mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = NotificationSerializer
    filterset_fields = ("kind", "is_read")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by("-created_at")

    @action(detail=False, methods=["get"], url_path="unread-count")
    def unread_count(self, request):
        count = Notification.objects.filter(user=request.user, is_read=False).count()
        return Response({"count": count})

    @action(detail=True, methods=["post"], url_path="mark-read")
    def mark_read(self, request, pk=None):
        notif = self.get_object()
        notif.is_read = True
        notif.save(update_fields=["is_read"])
        return Response(NotificationSerializer(notif).data)


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    filterset_fields = ("is_active", "owner_team")
    search_fields = ("name", "description")
    ordering_fields = ("name", "updated_at")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return Service.objects.select_related("owner_team").order_by("name")


class ServiceRelationshipViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceRelationshipSerializer
    filterset_fields = ("rel_type", "source_service")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return ServiceRelationship.objects.select_related("source_service", "target_service", "target_asset").order_by("rel_type")


class KnownErrorViewSet(viewsets.ModelViewSet):
    serializer_class = KnownErrorSerializer
    filterset_fields = ("problem_ticket",)

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return KnownError.objects.select_related("problem_ticket", "related_article").order_by("-updated_at")


class CabMeetingViewSet(viewsets.ModelViewSet):
    serializer_class = CabMeetingSerializer
    filterset_fields = ("changes",)
    ordering_fields = ("start_at", "created_at")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (IsAgent(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return CabMeeting.objects.prefetch_related("changes").order_by("-start_at")


class SlaPolicyViewSet(viewsets.ModelViewSet):
    serializer_class = SlaPolicySerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("kind", "priority", "is_active")
    ordering_fields = ("updated_at",)

    def get_queryset(self):
        return SlaPolicy.objects.all().order_by("-updated_at")

    @action(detail=False, methods=["post"], url_path="run")
    def run(self, request):
        now = timezone.now()
        open_tickets = Ticket.objects.filter(~Q(status__in=[Ticket.Status.CLOSED, Ticket.Status.CANCELED])).exclude(due_at__isnull=True)
        breached = 0
        at_risk = 0
        for t in open_tickets:
            policy = SlaPolicy.objects.filter(is_active=True, kind=t.kind, priority=t.priority).first()
            threshold = policy.at_risk_minutes if policy else 60
            remaining_min = int((t.due_at - now).total_seconds() // 60) if t.due_at else None

            if remaining_min is None:
                continue

            if remaining_min <= 0:
                if t.sla_status != Ticket.SlaStatus.BREACHED:
                    t.sla_status = Ticket.SlaStatus.BREACHED
                    t.breached_at = now
                    t.save(update_fields=["sla_status", "breached_at", "updated_at"])
                    breached += 1
                    if t.assignee_id:
                        Notification.objects.create(
                            user=t.assignee,
                            kind=Notification.Kind.SLA,
                            title=f"SLA breached: {t.number}",
                            body=t.title,
                            link=f"/tickets/{t.id}",
                        )
            elif remaining_min <= threshold:
                if t.sla_status != Ticket.SlaStatus.AT_RISK:
                    t.sla_status = Ticket.SlaStatus.AT_RISK
                    t.save(update_fields=["sla_status", "updated_at"])
                at_risk += 1
            else:
                if t.sla_status != Ticket.SlaStatus.ON_TRACK:
                    t.sla_status = Ticket.SlaStatus.ON_TRACK
                    t.save(update_fields=["sla_status", "updated_at"])

        return Response({"breached": breached, "at_risk": at_risk})


class AuditEventViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = AuditEventSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("action", "object_type")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return AuditEvent.objects.select_related("actor").order_by("-created_at")
