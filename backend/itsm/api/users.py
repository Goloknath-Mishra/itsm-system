from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.contrib.auth.tokens import default_token_generator
from django.core.mail import send_mail
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from itsm.api.common import create_audit_event
from itsm.models import UserPreference
from itsm.serializers import UserPreferenceSerializer, UserSummarySerializer

User = get_user_model()


class MeView(APIView):
    """Return and update the current user's profile fields."""

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
    """Store UI preferences (theme, layout, etc.) for the current user."""

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


class PasswordResetRequestView(APIView):
    """Request a password reset link (email is sent if the account exists)."""

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
    """Confirm password reset using uid+token from email link."""

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

