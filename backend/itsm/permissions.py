from __future__ import annotations

from rest_framework.permissions import BasePermission


def user_has_group(user, name: str) -> bool:
    """Return True if the authenticated user belongs to the given Django Group."""
    if not user or not user.is_authenticated:
        return False
    try:
        return user.groups.filter(name=name).exists()
    except Exception:
        return False


class IsAgent(BasePermission):
    """Allow access to operational ITSM capabilities (agent or privileged admin)."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                user.is_staff
                or getattr(user, "is_superuser", False)
                or user_has_group(user, "ITSM_AGENT")
                or user_has_group(user, "ITSM_ADMIN")
            )
        )


class IsPrivileged(BasePermission):
    """Allow access to privileged administration (configuration, master data, access mgmt)."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and (
                getattr(user, "is_superuser", False)
                or user_has_group(user, "ITSM_ADMIN")
            )
        )
