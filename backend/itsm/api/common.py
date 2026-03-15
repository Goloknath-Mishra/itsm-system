from __future__ import annotations

import csv
import io
import json
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.db.models import Q
from django.http import HttpResponse

from itsm.models import Asset, AuditEvent, CatalogRequest, KnowledgeArticle, ReportDefinition, ServiceRelationship, SystemSetting, Ticket


def create_audit_event(*, actor, action: str, obj, summary: str = "", data: dict | None = None):
    """Write an audit event for key actions (CRUD, status changes, access changes)."""
    object_id = getattr(obj, "id", None)
    if not isinstance(object_id, uuid.UUID):
        object_id = None
    AuditEvent.objects.create(
        actor=actor,
        action=action,
        object_type=obj.__class__.__name__,
        object_id=object_id,
        summary=summary,
        data=data or {},
    )


def send_webhook(url: str, payload: dict):
    """Send a basic JSON webhook message to an external endpoint (Teams/Slack)."""
    if not url:
        return
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5):
            return
    except Exception:
        return


def get_global_webhooks() -> tuple[str, str]:
    """Resolve global Teams/Slack webhook URLs from settings and DB-backed configuration."""
    teams_url = getattr(settings, "TEAMS_WEBHOOK_URL", "") or ""
    slack_url = getattr(settings, "SLACK_WEBHOOK_URL", "") or ""
    if teams_url and slack_url:
        return teams_url, slack_url
    cfg = SystemSetting.objects.filter(key="notifications").first()
    if cfg and isinstance(cfg.value, dict):
        if not teams_url:
            teams_url = str(cfg.value.get("teams_webhook_url") or "")
        if not slack_url:
            slack_url = str(cfg.value.get("slack_webhook_url") or "")
    return teams_url, slack_url


def simple_pdf(title: str, lines: list[str]) -> bytes:
    """Generate a minimal PDF document from text lines (no external dependencies)."""
    text_lines = [title, ""] + lines
    y = 792
    chunks = []
    for ln in text_lines[:70]:
        safe = ln.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        chunks.append(f"1 0 0 1 50 {y} Tm ({safe}) Tj")
        y -= 12
    stream = "BT /F1 10 Tf " + " ".join(chunks) + " ET"
    content = stream.encode("latin-1", errors="ignore")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(b"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources<< /Font<< /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n")
    objects.append(b"4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
    objects.append(b"5 0 obj<< /Length %d >>stream\n" % len(content) + content + b"\nendstream\nendobj\n")
    xref = [0]
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    for obj in objects:
        xref.append(pdf.tell())
        pdf.write(obj)
    xref_start = pdf.tell()
    pdf.write(b"xref\n0 %d\n" % (len(objects) + 1))
    pdf.write(b"0000000000 65535 f \n")
    for off in xref[1:]:
        pdf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    pdf.write(b"trailer<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1))
    pdf.write(b"startxref\n")
    pdf.write(str(xref_start).encode("ascii") + b"\n%%EOF")
    return pdf.getvalue()


def simple_xlsx(headers: list[str], rows: list[list[str]]) -> bytes:
    """Generate a minimal XLSX document from rows (no external dependencies)."""

    def esc(s: str) -> str:
        return (
            s.replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;")
            .replace("'", "&apos;")
        )

    sheet_rows = []
    r = 1
    sheet_rows.append(
        "<row r='1'>" + "".join([f"<c t='inlineStr'><is><t>{esc(h)}</t></is></c>" for h in headers]) + "</row>"
    )
    r += 1
    for row in rows:
        sheet_rows.append(
            f"<row r='{r}'>" + "".join([f"<c t='inlineStr'><is><t>{esc(str(v))}</t></is></c>" for v in row]) + "</row>"
        )
        r += 1

    sheet_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<worksheet xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'>"
        "<sheetData>"
        + "".join(sheet_rows)
        + "</sheetData>"
        "</worksheet>"
    )

    workbook_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<workbook xmlns='http://schemas.openxmlformats.org/spreadsheetml/2006/main' "
        "xmlns:r='http://schemas.openxmlformats.org/officeDocument/2006/relationships'>"
        "<sheets><sheet name='Report' sheetId='1' r:id='rId1'/></sheets>"
        "</workbook>"
    )

    rels_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet' Target='worksheets/sheet1.xml'/>"
        "</Relationships>"
    )

    root_rels_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Relationships xmlns='http://schemas.openxmlformats.org/package/2006/relationships'>"
        "<Relationship Id='rId1' Type='http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument' Target='xl/workbook.xml'/>"
        "</Relationships>"
    )

    content_types_xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        "<Types xmlns='http://schemas.openxmlformats.org/package/2006/content-types'>"
        "<Default Extension='rels' ContentType='application/vnd.openxmlformats-package.relationships+xml'/>"
        "<Default Extension='xml' ContentType='application/xml'/>"
        "<Override PartName='/xl/workbook.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'/>"
        "<Override PartName='/xl/worksheets/sheet1.xml' ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'/>"
        "</Types>"
    )

    import zipfile

    out = io.BytesIO()
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types_xml)
        z.writestr("_rels/.rels", root_rels_xml)
        z.writestr("xl/workbook.xml", workbook_xml)
        z.writestr("xl/_rels/workbook.xml.rels", rels_xml)
        z.writestr("xl/worksheets/sheet1.xml", sheet_xml)
    return out.getvalue()


CODE39 = {
    "0": "nnnwwnwnn",
    "1": "wnnwnnnnw",
    "2": "nnwwnnnnw",
    "3": "wnwwnnnnn",
    "4": "nnnwwnnnw",
    "5": "wnnwwnnnn",
    "6": "nnwwwnnnn",
    "7": "nnnwnnwnw",
    "8": "wnnwnnwnn",
    "9": "nnwwnnwnn",
    "A": "wnnnnwnnw",
    "B": "nnwnnwnnw",
    "C": "wnwnnwnnn",
    "D": "nnnnwwnnw",
    "E": "wnnnwwnnn",
    "F": "nnwnwwnnn",
    "G": "nnnnnwwnw",
    "H": "wnnnnwwnn",
    "I": "nnwnnwwnn",
    "J": "nnnnwwwnn",
    "K": "wnnnnnnww",
    "L": "nnwnnnnww",
    "M": "wnwnnnnwn",
    "N": "nnnnwnnww",
    "O": "wnnnwnnwn",
    "P": "nnwnwnnwn",
    "Q": "nnnnnnwww",
    "R": "wnnnnnwwn",
    "S": "nnwnnnwwn",
    "T": "nnnnwnwwn",
    "U": "wwnnnnnnw",
    "V": "nwwnnnnnw",
    "W": "wwwnnnnnn",
    "X": "nwnnwnnnw",
    "Y": "wwnnwnnnn",
    "Z": "nwwnwnnnn",
    "-": "nwnnnnwnw",
    ".": "wwnnnnwnn",
    " ": "nwwnnnwnn",
    "$": "nwnwnwnnn",
    "/": "nwnwnnnwn",
    "+": "nwnnnwnwn",
    "%": "nnnwnwnwn",
    "*": "nwnnwnwnn",
}


def code39_svg(value: str, *, height: int = 80, unit: int = 2, wide: int = 5) -> tuple[str, int]:
    """Return a Code39 SVG and its pixel width for a given value."""
    v = value.strip().upper()
    if not v:
        v = "0"
    encoded = "*" + "".join([ch for ch in v if ch in CODE39]) + "*"
    x = 0
    rects = []
    for ch in encoded:
        pattern = CODE39.get(ch, CODE39["0"])
        for i, p in enumerate(pattern):
            w = wide if p == "w" else unit
            is_bar = i % 2 == 0
            if is_bar:
                rects.append(f"<rect x='{x}' y='0' width='{w}' height='{height}' fill='black'/>")
            x += w
        x += unit
    width = x
    svg = f"<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'>{''.join(rects)}</svg>"
    return svg, width


def code39_pdf(value: str, *, page_w: int = 612, page_h: int = 288) -> bytes:
    """Return a simple PDF containing a Code39 barcode for the given value."""
    v = value.strip().upper()
    if not v:
        v = "0"
    encoded = "*" + "".join([ch for ch in v if ch in CODE39]) + "*"
    x = 50
    y = 150
    ops = []
    for ch in encoded:
        pattern = CODE39.get(ch, CODE39["0"])
        for i, p in enumerate(pattern):
            w = 5 if p == "w" else 2
            is_bar = i % 2 == 0
            if is_bar:
                ops.append(f"{x} {y} {w} 80 re f")
            x += w
        x += 2
    safe = v.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    ops.append(f"BT /F1 12 Tf 50 120 Tm ({safe}) Tj ET")
    stream = "0 0 0 rg " + " ".join(ops)
    content = stream.encode("latin-1", errors="ignore")
    objects = []
    objects.append(b"1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n")
    objects.append(b"2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n")
    objects.append(
        f"3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {page_w} {page_h}] /Resources<< /Font<< /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n".encode(
            "ascii"
        )
    )
    objects.append(b"4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n")
    objects.append(b"5 0 obj<< /Length %d >>stream\n" % len(content) + content + b"\nendstream\nendobj\n")
    xref = [0]
    pdf = io.BytesIO()
    pdf.write(b"%PDF-1.4\n")
    for obj in objects:
        xref.append(pdf.tell())
        pdf.write(obj)
    xref_start = pdf.tell()
    pdf.write(b"xref\n0 %d\n" % (len(objects) + 1))
    pdf.write(b"0000000000 65535 f \n")
    for off in xref[1:]:
        pdf.write(f"{off:010d} 00000 n \n".encode("ascii"))
    pdf.write(b"trailer<< /Size %d /Root 1 0 R >>\n" % (len(objects) + 1))
    pdf.write(b"startxref\n")
    pdf.write(str(xref_start).encode("ascii") + b"\n%%EOF")
    return pdf.getvalue()


def report_dataset_config(dataset: str):
    """Return a queryset and a field->Django-path map for a report dataset."""
    if dataset == ReportDefinition.Dataset.TICKETS:
        qs = Ticket.objects.select_related("assignee", "assignment_group", "requester", "affected_service")
        fields = {
            "number": "number",
            "kind": "kind",
            "status": "status",
            "priority": "priority",
            "impact": "impact",
            "urgency": "urgency",
            "category": "category",
            "subcategory": "subcategory",
            "title": "title",
            "assignee": "assignee__username",
            "assignment_group": "assignment_group__name",
            "requester": "requester__username",
            "sla_status": "sla_status",
            "due_at": "due_at",
            "created_at": "created_at",
            "updated_at": "updated_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.ASSETS:
        qs = Asset.objects.select_related("owner")
        fields = {
            "asset_tag": "asset_tag",
            "name": "name",
            "status": "status",
            "owner": "owner__username",
            "location": "location",
            "vendor": "vendor",
            "model": "model",
            "serial_number": "serial_number",
            "updated_at": "updated_at",
            "created_at": "created_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.KNOWLEDGE:
        qs = KnowledgeArticle.objects.select_related("author")
        fields = {
            "title": "title",
            "category": "category",
            "status": "status",
            "author": "author__username",
            "published_at": "published_at",
            "updated_at": "updated_at",
            "created_at": "created_at",
        }
        return qs, fields

    if dataset == ReportDefinition.Dataset.CATALOG_REQUESTS:
        qs = CatalogRequest.objects.select_related("item", "requester", "ticket")
        fields = {
            "id": "id",
            "item": "item__name",
            "status": "status",
            "requester": "requester__username",
            "approved_at": "approved_at",
            "requested_at": "requested_at",
            "updated_at": "updated_at",
            "ticket_number": "ticket__number",
        }
        return qs, fields

    return Ticket.objects.none(), {}


def parse_value(v):
    """Best-effort type coercion for report condition values."""
    if isinstance(v, bool) or v is None:
        return v
    if isinstance(v, (int, float)):
        return v
    if isinstance(v, str):
        s = v.strip()
        if s.isdigit():
            return int(s)
        return s
    return v


def build_report_q(node: dict, field_map: dict[str, str]) -> Q:
    """Convert a JSON-like rule/group structure into a Django Q object."""
    if not isinstance(node, dict):
        return Q()
    node_type = (node.get("type") or "group").lower()
    if node_type == "rule":
        field_key = node.get("field")
        op = (node.get("op") or "eq").lower()
        raw_value = node.get("value")
        if field_key not in field_map:
            return Q()
        path = field_map[field_key]
        value = parse_value(raw_value)
        if op == "eq":
            return Q(**{path: value})
        if op == "ne":
            return ~Q(**{path: value})
        if op == "contains":
            return Q(**{f"{path}__icontains": str(value)})
        if op == "startswith":
            return Q(**{f"{path}__istartswith": str(value)})
        if op == "endswith":
            return Q(**{f"{path}__iendswith": str(value)})
        if op == "gt":
            return Q(**{f"{path}__gt": value})
        if op == "gte":
            return Q(**{f"{path}__gte": value})
        if op == "lt":
            return Q(**{f"{path}__lt": value})
        if op == "lte":
            return Q(**{f"{path}__lte": value})
        if op == "in":
            if isinstance(value, str):
                parts = [p.strip() for p in value.split(",") if p.strip()]
            elif isinstance(value, list):
                parts = value
            else:
                parts = [value]
            return Q(**{f"{path}__in": parts})
        if op == "isnull":
            return Q(**{f"{path}__isnull": bool(value)})
        return Q()

    group_op = (node.get("op") or "and").upper()
    children = node.get("children") or node.get("items") or []
    q = Q()
    first = True
    for child in children:
        child_q = build_report_q(child, field_map)
        if first:
            q = child_q
            first = False
            continue
        if group_op == "OR":
            q = q | child_q
        else:
            q = q & child_q
    return q


def response_csv(filename: str, headers: list[str], rows: list[list[str]]) -> HttpResponse:
    """Build a CSV download response."""
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(headers)
    for r in rows:
        w.writerow(r)
    data = buf.getvalue().encode("utf-8")
    resp = HttpResponse(data, content_type="text/csv")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp

