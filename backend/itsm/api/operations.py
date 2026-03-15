from __future__ import annotations

import csv
import io
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.api.common import code39_pdf, code39_svg, create_audit_event, get_global_webhooks, send_webhook, simple_pdf
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
    DynamicForm,
    KnowledgeArticle,
    KnowledgeFeedback,
    KnownError,
    Notification,
    Service,
    ServiceRelationship,
    SystemSetting,
    Ticket,
    TicketApproval,
    UserBadge,
    WarRoom,
    WarRoomMessage,
    WarRoomParticipant,
    WorkflowVersion,
    PointEvent,
)
from itsm.permissions import IsAgent, IsPrivileged
from itsm.serializers import (
    AssetAlertSerializer,
    AssetMetricSerializer,
    AssetRecommendationSerializer,
    AssetSerializer,
    AssetTransactionSerializer,
    BarcodeTemplateSerializer,
    CabMeetingSerializer,
    CatalogItemSerializer,
    CatalogRequestSerializer,
    DynamicFormSerializer,
    KnowledgeArticleSerializer,
    KnowledgeFeedbackSerializer,
    KnownErrorSerializer,
    NotificationSerializer,
    ServiceRelationshipSerializer,
    ServiceSerializer,
    TicketApprovalSerializer,
    WarRoomMessageSerializer,
    WarRoomSerializer,
    WorkflowVersionSerializer,
)

User = get_user_model()


class VirtualAgentView(APIView):
    """Virtual Agent endpoint: suggests relevant knowledge and catalog items."""

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


class WarRoomViewSet(viewsets.ReadOnlyModelViewSet):
    """War room read APIs including messages and exports (role-aware)."""

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
    """Knowledge article CRUD with publishing workflow and feedback endpoint."""

    serializer_class = KnowledgeArticleSerializer
    filterset_fields = ("status", "category")
    ordering_fields = ("created_at", "updated_at", "published_at", "title")
    search_fields = ("title", "body", "category")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsAgent(),)

    def get_queryset(self):
        qs = KnowledgeArticle.objects.select_related("author").annotate(rating_avg=Avg("feedback__rating"), rating_count=Count("feedback"))
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
    """Asset register CRUD, barcodes, and transactions."""

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
    """Barcode template CRUD (privileged admin)."""

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
    """Asset telemetry ingestion and anomaly detection."""

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
            AssetAlert.objects.create(asset=asset, kind=kind, severity=severity, message=msg)
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
    """Asset alerts with resolve action."""

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
    """Read-only recommendations list for assets (agent-facing)."""

    serializer_class = AssetRecommendationSerializer
    permission_classes = (IsAgent,)
    filterset_fields = ("asset", "kind")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return AssetRecommendation.objects.select_related("asset").order_by("-created_at")


class DynamicFormViewSet(viewsets.ModelViewSet):
    """Dynamic form CRUD and publishing endpoint."""

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
    """Service catalog item CRUD (privileged create/update; authenticated list)."""

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
    """Catalog requests linked to a service request ticket."""

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
    """In-app notifications for the authenticated user."""

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
    """CMDB services (authenticated list; privileged modifications)."""

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
    """Service relationships for impact analysis (authenticated list; privileged modifications)."""

    serializer_class = ServiceRelationshipSerializer
    filterset_fields = ("rel_type", "source_service")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return ServiceRelationship.objects.select_related("source_service", "target_service", "target_asset").order_by("rel_type")


class KnownErrorViewSet(viewsets.ModelViewSet):
    """Known error library linked to Problem tickets."""

    serializer_class = KnownErrorSerializer
    filterset_fields = ("problem_ticket",)

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return KnownError.objects.select_related("problem_ticket", "related_article").order_by("-updated_at")


class CabMeetingViewSet(viewsets.ModelViewSet):
    """CAB meetings for change governance."""

    serializer_class = CabMeetingSerializer
    filterset_fields = ("changes",)
    ordering_fields = ("start_at", "created_at")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (IsAgent(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return CabMeeting.objects.prefetch_related("changes").order_by("-start_at")
