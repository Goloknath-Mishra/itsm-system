from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from itsm.models import Ticket

User = get_user_model()


class TicketApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.requester = User.objects.create_user(username="requester", password="pw12345678")
        self.other_requester = User.objects.create_user(username="other", password="pw12345678")
        self.agent = User.objects.create_user(username="agent", password="pw12345678", is_staff=True)

    def authenticate(self, username: str, password: str):
        resp = self.client.post("/api/token/", {"username": username, "password": password}, format="json")
        self.assertEqual(resp.status_code, 200)
        access = resp.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")

    def test_requester_can_create_ticket_and_only_sees_own(self):
        self.authenticate("requester", "pw12345678")

        resp = self.client.post(
            "/api/tickets/",
            {"title": "Email down", "description": "Cannot send email", "kind": Ticket.Kind.INCIDENT},
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        self.assertTrue(resp.data["number"].startswith("ITSM-"))

        Ticket.objects.create(
            title="Other issue",
            description="",
            requester=self.other_requester,
            kind=Ticket.Kind.INCIDENT,
            status=Ticket.Status.NEW,
            priority=Ticket.Priority.P3,
        )

        list_resp = self.client.get("/api/tickets/")
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.data), 1)

    def test_agent_sees_all_tickets(self):
        Ticket.objects.create(
            title="Requester issue",
            description="",
            requester=self.requester,
            kind=Ticket.Kind.INCIDENT,
            status=Ticket.Status.NEW,
            priority=Ticket.Priority.P3,
        )
        Ticket.objects.create(
            title="Other issue",
            description="",
            requester=self.other_requester,
            kind=Ticket.Kind.INCIDENT,
            status=Ticket.Status.NEW,
            priority=Ticket.Priority.P3,
        )

        self.authenticate("agent", "pw12345678")
        list_resp = self.client.get("/api/tickets/")
        self.assertEqual(list_resp.status_code, 200)
        self.assertEqual(len(list_resp.data), 2)

    def test_requester_cannot_change_status(self):
        ticket = Ticket.objects.create(
            title="Issue",
            description="",
            requester=self.requester,
            kind=Ticket.Kind.INCIDENT,
            status=Ticket.Status.NEW,
            priority=Ticket.Priority.P3,
        )

        self.authenticate("requester", "pw12345678")
        resp = self.client.patch(f"/api/tickets/{ticket.id}/", {"status": Ticket.Status.RESOLVED}, format="json")
        self.assertEqual(resp.status_code, 400)

    def test_agent_can_assign_to_me(self):
        ticket = Ticket.objects.create(
            title="Issue",
            description="",
            requester=self.requester,
            kind=Ticket.Kind.INCIDENT,
            status=Ticket.Status.NEW,
            priority=Ticket.Priority.P3,
        )
        self.authenticate("agent", "pw12345678")
        resp = self.client.post(f"/api/tickets/{ticket.id}/assign-to-me/", {}, format="json")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["assignee"]["username"], "agent")
