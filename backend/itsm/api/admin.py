from __future__ import annotations

import csv
import io
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.mail import EmailMessage
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncMonth
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.api.common import build_report_q, create_audit_event, report_dataset_config, simple_pdf, simple_xlsx
from itsm.models import (
    AuditEvent,
    ConfigEntry,
    DynamicForm,
    KnowledgeArticle,
    Notification,
    PointEvent,
    ReportDefinition,
    ReportSchedule,
    Reward,
    RewardRedemption,
    SlaPolicy,
    SystemSetting,
    TeamChallenge,
    Ticket,
    TicketNumberConfig,
    UserBadge,
    WarRoomMessage,
    Workflow,
    WorkflowRun,
    WorkflowVersion,
)
from itsm.permissions import IsAgent, IsPrivileged
from itsm.serializers import (
    AuditEventSerializer,
    DynamicFormSerializer,
    PointEventSerializer,
    ReportDefinitionSerializer,
    ReportScheduleSerializer,
    RewardRedemptionSerializer,
    RewardSerializer,
    SlaPolicySerializer,
    SystemSettingSerializer,
    TeamChallengeSerializer,
    TicketNumberConfigSerializer,
    UserBadgeSerializer,
    UserSummarySerializer,
    WorkflowRunSerializer,
    WorkflowSerializer,
    WorkflowVersionSerializer,
)

User = get_user_model()


class GamificationLeaderboardView(APIView):
    """Leaderboard for a period (daily/weekly/monthly) based on point events."""

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
    """Return badges for the current user."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        qs = UserBadge.objects.filter(user=request.user).order_by("-created_at")
        return Response(UserBadgeSerializer(qs, many=True).data)


class GamificationBalanceView(APIView):
    """Return current points earned/spent balance for the current user."""

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
    """Compute achievement progress for the current user."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        user = request.user
        metrics = {
            "total_points": int(PointEvent.objects.filter(user=user).aggregate(total=Sum("points"))["total"] or 0),
            "sla_resolves": int(PointEvent.objects.filter(user=user, reason="SLA_RESOLVE").count()),
            "knowledge_published": int(
                KnowledgeArticle.objects.filter(author=user, status=KnowledgeArticle.Status.PUBLISHED).count()
            ),
            "war_room_messages": int(WarRoomMessage.objects.filter(author=user).count()),
            "workflow_deploys": int(
                WorkflowVersion.objects.filter(created_by=user, status=WorkflowVersion.Status.DEPLOYED).count()
            ),
        }
        defs = (
            ConfigEntry.objects.filter(namespace__key="achievements", is_active=True)
            .select_related("namespace")
            .order_by("sort_order", "label")
        )

        items = []
        for d in defs:
            v = d.value if isinstance(d.value, dict) else {}
            metric = str(v.get("metric") or "").strip()
            goal_i = int(v.get("goal") or 0)
            progress_i = int(metrics.get(metric, 0))
            items.append(
                {
                    "key": d.key,
                    "title": d.label,
                    "description": d.description or "",
                    "progress": progress_i,
                    "goal": goal_i,
                    "achieved": progress_i >= goal_i,
                    "percent": 100 if goal_i == 0 else min(100, int((progress_i / goal_i) * 100)),
                }
            )
        return Response({"items": items})


class GamificationHallOfFameView(APIView):
    """All-time and monthly winners based on point events."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        all_time = PointEvent.objects.values("user").annotate(points=Sum("points"), events=Count("id")).order_by("-points")[:10]
        user_ids = [row["user"] for row in all_time]
        users = {u.id: u for u in User.objects.filter(id__in=user_ids)}
        all_time_rows = []
        for row in all_time:
            u = users.get(row["user"])
            if not u:
                continue
            all_time_rows.append({"user": UserSummarySerializer(u).data, "points": int(row["points"] or 0), "events": int(row["events"] or 0)})

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
            monthly.append({"month": key, "winner": {"user": UserSummarySerializer(u).data, "points": int(r["points"] or 0), "events": int(r["events"] or 0)}})
            if len(monthly) >= 6:
                break

        return Response({"all_time": all_time_rows, "monthly_champions": monthly})


class RewardViewSet(viewsets.ModelViewSet):
    """Rewards catalog and redemption endpoint."""

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

        redemption = RewardRedemption.objects.create(reward=reward, user=request.user, cost_points=reward.cost_points, status=RewardRedemption.Status.REQUESTED)
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
    """Privileged view of reward redemptions for approval/fulfillment."""

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
    """Ticket numbering configuration (singleton)."""

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
    """Key/value JSON settings stored in DB (privileged)."""

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
    """Team challenges used by gamification."""

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
            count = PointEvent.objects.filter(created_at__gte=start, created_at__lte=window_end, reason="SLA_RESOLVE", ticket__assignment_group=ch.team).count()
        else:
            count = PointEvent.objects.filter(created_at__gte=start, created_at__lte=window_end, reason="KNOWLEDGE_PUBLISH").count()

        pct = 0 if ch.goal == 0 else min(100, int((count / ch.goal) * 100))
        return Response({"count": count, "goal": ch.goal, "percent": pct, "start_at": ch.start_at, "end_at": ch.end_at})


class ReportDefinitionViewSet(viewsets.ModelViewSet):
    """Report definitions and ad-hoc export execution."""

    serializer_class = ReportDefinitionSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("dataset", "is_public")
    search_fields = ("name",)
    ordering_fields = ("updated_at", "created_at", "name")

    def get_queryset(self):
        return ReportDefinition.objects.select_related("created_by").order_by("-updated_at")

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
    """Scheduled report delivery via email."""

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
        qs = ReportSchedule.objects.filter(is_active=True).filter(Q(next_run_at__lte=now) | Q(next_run_at__isnull=True)).select_related("report")
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
    """Template replacement for workflow notification steps."""
    out = template or ""
    for k, v in context.items():
        out = out.replace("{{" + k + "}}", str(v))
    return out


def workflow_execute(*, schema: dict, input_data: dict, sandbox: bool, actor) -> tuple[dict, list[str], str | None]:
    """Execute a workflow schema against a ticket input (very small interpreter)."""
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
                        from itsm.api.common import send_webhook as _send

                        _send(settings.TEAMS_WEBHOOK_URL, payload)
                    else:
                        from itsm.api.common import send_webhook as _send

                        _send(settings.SLACK_WEBHOOK_URL, payload)
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
    """Workflow CRUD and execution endpoints (privileged)."""

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
    """Workflow version CRUD (privileged)."""

    serializer_class = WorkflowVersionSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("workflow", "status")
    ordering_fields = ("version", "created_at")

    def get_queryset(self):
        return WorkflowVersion.objects.select_related("workflow", "created_by").order_by("-created_at")

    def perform_update(self, serializer):
        v = serializer.save()
        create_audit_event(actor=self.request.user, action="workflow.version.update", obj=v, summary=str(v.version))


class SlaPolicyViewSet(viewsets.ModelViewSet):
    """SLA policy configuration and SLA evaluation runner."""

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
    """Privileged audit log endpoint."""

    serializer_class = AuditEventSerializer
    permission_classes = (IsPrivileged,)
    filterset_fields = ("action", "object_type")
    ordering_fields = ("created_at",)

    def get_queryset(self):
        return AuditEvent.objects.select_related("actor").order_by("-created_at")
