from __future__ import annotations

from datetime import timedelta

from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.models import AssetAlert, AssetMetric, AssetRecommendation, CatalogItem, KnowledgeArticle, Ticket
from itsm.permissions import IsAgent
from itsm.serializers import AssetRecommendationSerializer


class AnalyticsView(APIView):
    """High-level KPIs for the dashboard (agent-facing)."""

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


class AssetAnalyticsView(APIView):
    """Asset analytics summary for the asset dashboard (agent-facing)."""

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

