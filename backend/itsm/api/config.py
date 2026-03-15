from __future__ import annotations

from rest_framework import permissions, viewsets

from itsm.api.common import create_audit_event
from itsm.models import ConfigEntry, ConfigNamespace
from itsm.permissions import IsPrivileged
from itsm.serializers import ConfigEntrySerializer, ConfigNamespaceSerializer


class ConfigNamespaceViewSet(viewsets.ModelViewSet):
    """CRUD for configuration namespaces (privileged write; authenticated read)."""

    serializer_class = ConfigNamespaceSerializer
    filterset_fields = ("key", "is_active")
    search_fields = ("key", "name", "description")
    ordering_fields = ("key", "updated_at")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        return ConfigNamespace.objects.all().order_by("key")

    def perform_create(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="config.namespace.create", obj=obj, summary=obj.key)

    def perform_update(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="config.namespace.update", obj=obj, summary=obj.key)


class ConfigEntryViewSet(viewsets.ModelViewSet):
    """CRUD for configuration entries (privileged write; authenticated read)."""

    serializer_class = ConfigEntrySerializer
    filterset_fields = ("namespace", "is_active")
    search_fields = ("key", "label", "description")
    ordering_fields = ("sort_order", "updated_at", "key")

    def get_permissions(self):
        if self.action in ("list", "retrieve"):
            return (permissions.IsAuthenticated(),)
        return (IsPrivileged(),)

    def get_queryset(self):
        qs = ConfigEntry.objects.select_related("namespace").order_by("namespace__key", "sort_order", "label")
        namespace_key = (self.request.query_params.get("namespace_key") or "").strip()
        if namespace_key:
            qs = qs.filter(namespace__key=namespace_key)
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="config.entry.create", obj=obj, summary=f"{obj.namespace.key}:{obj.key}")

    def perform_update(self, serializer):
        obj = serializer.save(updated_by=self.request.user)
        create_audit_event(actor=self.request.user, action="config.entry.update", obj=obj, summary=f"{obj.namespace.key}:{obj.key}")

