from __future__ import annotations

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response

from itsm.api.common import create_audit_event, get_global_webhooks, send_webhook
from itsm.models import ConfigEntry, KnowledgeArticle, Notification, PointEvent, ServiceRelationship, SlaPolicy, SystemSetting, Team, Ticket, TicketApproval, TicketComment, WarRoom, WarRoomParticipant
from itsm.permissions import IsAgent, IsPrivileged
from itsm.serializers import (
    NotificationSerializer,
    SlaPolicySerializer,
    TeamSerializer,
    TicketApprovalInputSerializer,
    TicketApprovalSerializer,
    TicketCommentCreateSerializer,
    TicketCommentSerializer,
    TicketSerializer,
    WarRoomSerializer,
)

User = get_user_model()


class TeamViewSet(viewsets.ModelViewSet):
    """Team master data used for assignment and service ownership."""

    queryset = Team.objects.all().order_by("name")
    serializer_class = TeamSerializer
    filterset_fields = ("is_active",)
    search_fields = ("name", "email")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (IsAgent(),)
        return (IsPrivileged(),)


class TicketViewSet(viewsets.ModelViewSet):
    """Core ticket API (incidents, requests, problems, changes) with role-aware access."""

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
        comment = TicketComment.objects.create(ticket=ticket, author=request.user, body=serializer.validated_data["body"])
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
        suggested_group = None
        rules = (
            ConfigEntry.objects.filter(namespace__key="ai_routing_rules", is_active=True)
            .select_related("namespace")
            .order_by("sort_order", "label")
        )
        for r in rules:
            value = r.value if isinstance(r.value, dict) else {}
            needle = str(value.get("keyword") or r.key).strip().lower()
            team_name = str(value.get("team_name") or "").strip()
            if not needle or not team_name:
                continue
            if needle in text:
                suggested_group = Team.objects.filter(name__iexact=team_name).first()
                if suggested_group:
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
            rels = ServiceRelationship.objects.filter(source_service__in=[s.id for s in frontier]).select_related("target_service", "target_asset")
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
