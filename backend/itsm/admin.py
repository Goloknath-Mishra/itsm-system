from django.contrib import admin

from itsm.models import Asset, KnowledgeArticle, Team, Ticket, TicketApproval, TicketComment


@admin.register(Team)
class TeamAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "is_active")
    search_fields = ("name", "email")


@admin.register(Ticket)
class TicketAdmin(admin.ModelAdmin):
    list_display = ("number", "kind", "status", "priority", "title", "requester", "assignee", "created_at")
    list_filter = ("kind", "status", "priority")
    search_fields = ("number", "title", "description")
    autocomplete_fields = ("requester", "assignee")


@admin.register(TicketComment)
class TicketCommentAdmin(admin.ModelAdmin):
    list_display = ("ticket", "author", "created_at")
    search_fields = ("ticket__number", "body")
    autocomplete_fields = ("ticket", "author")


@admin.register(TicketApproval)
class TicketApprovalAdmin(admin.ModelAdmin):
    list_display = ("ticket", "approver", "status", "requested_at", "responded_at")
    list_filter = ("status",)
    autocomplete_fields = ("ticket", "approver")


@admin.register(KnowledgeArticle)
class KnowledgeArticleAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "category", "author", "updated_at")
    list_filter = ("status", "category")
    search_fields = ("title", "body", "category")
    autocomplete_fields = ("author",)


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ("asset_tag", "name", "status", "owner", "updated_at")
    list_filter = ("status",)
    search_fields = ("asset_tag", "name", "serial_number", "vendor", "model")
    autocomplete_fields = ("owner",)
