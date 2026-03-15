from __future__ import annotations

from django.contrib.auth import get_user_model
from rest_framework import viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.api.common import create_audit_event
from itsm.models import ConfigEntry
from itsm.permissions import IsPrivileged
from itsm.serializers import AdminUserSerializer

User = get_user_model()


class AdminRolesView(APIView):
    """Expose supported RBAC roles to drive the admin UI."""

    permission_classes = (IsPrivileged,)

    def get(self, request):
        entries = (
            ConfigEntry.objects.filter(namespace__key="roles", is_active=True)
            .select_related("namespace")
            .order_by("sort_order", "label")
        )
        roles = [{"name": e.key, "label": e.label, "description": e.description or ""} for e in entries]
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
