from __future__ import annotations

from django.db.models import Q
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.models import Asset, KnowledgeArticle, Service, Ticket


class GlobalSearchView(APIView):
    """Global search across major objects (tickets, knowledge, assets, CMDB services).

    This endpoint is used by the UI topbar search and returns a compact result set
    suitable for rendering as a global search results page.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request):
        q = (request.query_params.get("q") or "").strip()
        if not q:
            return Response({"q": "", "tickets": [], "knowledge": [], "assets": [], "services": []})

        user = request.user
        is_agent = bool(
            user
            and user.is_authenticated
            and (user.is_staff or user.is_superuser or user.groups.filter(name__in=["ITSM_AGENT", "ITSM_ADMIN"]).exists())
        )

        ticket_qs = Ticket.objects.select_related("requester", "assignee", "assignment_group", "affected_service")
        if not is_agent:
            ticket_qs = ticket_qs.filter(requester=user)
        ticket_qs = ticket_qs.filter(
            Q(number__icontains=q)
            | Q(title__icontains=q)
            | Q(description__icontains=q)
            | Q(resolution_summary__icontains=q)
            | Q(category__icontains=q)
            | Q(subcategory__icontains=q)
        ).order_by("-updated_at")[:25]

        knowledge_qs = KnowledgeArticle.objects.select_related("author")
        if not is_agent:
            knowledge_qs = knowledge_qs.filter(status=KnowledgeArticle.Status.PUBLISHED)
        knowledge_qs = knowledge_qs.filter(Q(title__icontains=q) | Q(body__icontains=q) | Q(category__icontains=q)).order_by("-updated_at")[
            :25
        ]

        assets = []
        services = []
        if is_agent:
            assets_qs = Asset.objects.select_related("owner").filter(
                Q(asset_tag__icontains=q)
                | Q(name__icontains=q)
                | Q(serial_number__icontains=q)
                | Q(vendor__icontains=q)
                | Q(model__icontains=q)
            )[:25]
            assets = [
                {"id": str(a.id), "asset_tag": a.asset_tag, "name": a.name, "status": a.status}
                for a in assets_qs
            ]

            services_qs = Service.objects.filter(Q(name__icontains=q) | Q(description__icontains=q)).order_by("name")[:25]
            services = [{"id": str(s.id), "name": s.name, "is_active": s.is_active} for s in services_qs]

        return Response(
            {
                "q": q,
                "tickets": [
                    {
                        "id": str(t.id),
                        "number": t.number,
                        "title": t.title,
                        "kind": t.kind,
                        "status": t.status,
                        "priority": t.priority,
                    }
                    for t in ticket_qs
                ],
                "knowledge": [
                    {"id": str(a.id), "title": a.title, "category": a.category, "status": a.status}
                    for a in knowledge_qs
                ],
                "assets": assets,
                "services": services,
            }
        )

