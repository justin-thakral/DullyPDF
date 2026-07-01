#!/usr/bin/env python3
"""Generate a small set of premium first-party catalog templates.

These templates are hand-authored workflow packets for gaps where the existing
generated catalog has either no direct coverage or only a generic one-page
variant. The generator is O(t * b), where t is the fixed number of templates
and b is the number of blocks in each template. Each block emits a bounded
number of PDF widgets, so runtime and output size stay predictable.
"""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = REPO_ROOT / "form_catalog"
METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"
DESCRIPTIONS_PATH = CATALOG_ROOT / "descriptions.json"
PAGE_WIDTH, PAGE_HEIGHT = letter


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def filename_for(form_number: str, title: str) -> str:
    return f"{slugify(form_number)}__{slugify(title)}.pdf"


@dataclass(frozen=True)
class PremiumTemplate:
    section: str
    form_number: str
    title: str
    subtitle: str
    description: str
    use_case: str
    renderer: Callable[["PremiumBuilder"], None]

    @property
    def filename(self) -> str:
        return filename_for(self.form_number, self.title)


class PremiumBuilder:
    def __init__(self, c: canvas.Canvas, spec: PremiumTemplate):
        self.canvas = c
        self.spec = spec
        self.margin_x = 0.58 * inch
        self.top_margin = PAGE_HEIGHT - 0.56 * inch
        self.bottom_margin = 0.58 * inch
        self.content_width = PAGE_WIDTH - 2 * self.margin_x
        self.y = self.top_margin
        self.page_number = 0
        self.field_counter = 0
        self.prefix = slugify(spec.form_number)
        self.styles = self._build_styles()
        self.new_page()

    def _build_styles(self) -> dict[str, ParagraphStyle]:
        base = getSampleStyleSheet()
        return {
            "title": ParagraphStyle(
                "PremiumCatalogTitle",
                parent=base["Heading1"],
                fontName="Helvetica-Bold",
                fontSize=16.5,
                leading=19,
                textColor=colors.HexColor("#0F172A"),
                spaceAfter=0,
            ),
            "subtitle": ParagraphStyle(
                "PremiumCatalogSubtitle",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=8.5,
                leading=10.5,
                textColor=colors.HexColor("#334155"),
                spaceAfter=0,
            ),
            "body": ParagraphStyle(
                "PremiumCatalogBody",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=8,
                leading=10,
                textColor=colors.HexColor("#334155"),
                spaceAfter=0,
            ),
            "small": ParagraphStyle(
                "PremiumCatalogSmall",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=7,
                leading=8.5,
                textColor=colors.HexColor("#64748B"),
                spaceAfter=0,
            ),
        }

    def _field_name(self, key: str) -> str:
        self.field_counter += 1
        return f"{self.prefix}_{slugify(key)}_{self.field_counter}"

    def _paragraph(self, text: str, style_name: str, x: float, top_y: float, width: float) -> float:
        para = Paragraph(text, self.styles[style_name])
        _, height = para.wrap(width, PAGE_HEIGHT)
        para.drawOn(self.canvas, x, top_y - height)
        return height

    def _footer(self) -> None:
        self.canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.canvas.line(
            self.margin_x,
            self.bottom_margin + 0.12 * inch,
            PAGE_WIDTH - self.margin_x,
            self.bottom_margin + 0.12 * inch,
        )
        footer = (
            "DullyPDF original fillable template. Review local legal, safety, privacy, "
            "tax, insurance, and record-retention requirements before production use."
        )
        self._paragraph(footer, "small", self.margin_x, self.bottom_margin + 0.05 * inch, self.content_width - 0.5 * inch)
        self.canvas.setFillColor(colors.HexColor("#64748B"))
        self.canvas.setFont("Helvetica", 7)
        self.canvas.drawRightString(PAGE_WIDTH - self.margin_x, self.bottom_margin + 0.03 * inch, f"Page {self.page_number}")

    def new_page(self) -> None:
        if self.page_number:
            self._footer()
            self.canvas.showPage()
        self.page_number += 1
        self.y = self.top_margin
        self.canvas.setFillColor(colors.HexColor("#E0F2FE"))
        self.canvas.roundRect(self.margin_x, self.y - 0.5 * inch, self.content_width, 0.54 * inch, 6, stroke=0, fill=1)
        title = self.spec.title if self.page_number == 1 else f"{self.spec.title} - Page {self.page_number}"
        self._paragraph(title, "title", self.margin_x + 10, self.y - 6, self.content_width - 1.25 * inch)
        self.canvas.setFillColor(colors.HexColor("#0F172A"))
        self.canvas.setFont("Helvetica-Bold", 9)
        self.canvas.drawRightString(PAGE_WIDTH - self.margin_x - 10, self.y - 18, self.spec.form_number)
        used = self._paragraph(self.spec.subtitle, "subtitle", self.margin_x, self.y - 0.62 * inch, self.content_width)
        self.y -= 0.7 * inch + used + 10

    def save(self) -> None:
        self._footer()
        self.canvas.save()

    def ensure_space(self, height: float) -> None:
        if self.y - height < self.bottom_margin + 0.18 * inch:
            self.new_page()

    def note(self, text: str) -> None:
        height = self._paragraph(text, "body", self.margin_x, self.y, self.content_width)
        self.y -= height + 8

    def section(self, title: str, helper: str | None = None) -> None:
        helper_height = 0
        if helper:
            para = Paragraph(helper, self.styles["body"])
            _, helper_height = para.wrap(self.content_width - 8, PAGE_HEIGHT)
        self.ensure_space(28 + helper_height)
        self.canvas.setFillColor(colors.HexColor("#E2E8F0"))
        self.canvas.roundRect(self.margin_x, self.y - 17, self.content_width, 18, 4, stroke=0, fill=1)
        self.canvas.setFillColor(colors.HexColor("#0F172A"))
        self.canvas.setFont("Helvetica-Bold", 9.5)
        self.canvas.drawString(self.margin_x + 7, self.y - 12, title[:94])
        self.y -= 25
        if helper:
            used = self._paragraph(helper, "body", self.margin_x + 2, self.y, self.content_width - 4)
            self.y -= used + 8

    def text_row(self, fields: list[dict], *, height: float = 18, gap: float = 8) -> None:
        self.ensure_space(height + 24)
        total_units = sum(field.get("units", 1.0) for field in fields)
        available_width = self.content_width - gap * (len(fields) - 1)
        x = self.margin_x
        for field in fields:
            width = available_width * (field.get("units", 1.0) / total_units)
            label = field["label"]
            self.canvas.setFillColor(colors.HexColor("#1F2937"))
            self.canvas.setFont("Helvetica", 7.6)
            self.canvas.drawString(x, self.y, label[:58])
            kwargs = {"fieldFlags": "multiline"} if field.get("multiline") else {}
            self.canvas.acroForm.textfield(
                name=self._field_name(field["key"]),
                tooltip=label,
                x=x,
                y=self.y - height - 4,
                width=width,
                height=height,
                borderStyle="solid",
                borderColor=colors.HexColor("#94A3B8"),
                fillColor=colors.HexColor("#F8FAFC"),
                textColor=colors.black,
                fontName="Helvetica",
                fontSize=8,
                **kwargs,
            )
            x += width + gap
        self.y -= height + 21

    def textarea(self, key: str, label: str, *, height: float = 44) -> None:
        self.ensure_space(height + 22)
        self.canvas.setFillColor(colors.HexColor("#1F2937"))
        self.canvas.setFont("Helvetica", 7.8)
        self.canvas.drawString(self.margin_x, self.y, label[:105])
        self.canvas.acroForm.textfield(
            name=self._field_name(key),
            tooltip=label,
            x=self.margin_x,
            y=self.y - height - 4,
            width=self.content_width,
            height=height,
            borderStyle="solid",
            borderColor=colors.HexColor("#94A3B8"),
            fillColor=colors.HexColor("#F8FAFC"),
            textColor=colors.black,
            fontName="Helvetica",
            fontSize=8,
            fieldFlags="multiline",
        )
        self.y -= height + 20

    def checkboxes(self, key_prefix: str, label: str, options: list[str], *, columns: int = 2) -> None:
        rows = (len(options) + columns - 1) // columns
        self.ensure_space(rows * 15 + 25)
        self.canvas.setFillColor(colors.HexColor("#1F2937"))
        self.canvas.setFont("Helvetica", 7.8)
        self.canvas.drawString(self.margin_x, self.y, label[:95])
        col_width = self.content_width / columns
        start_y = self.y - 16
        for index, option in enumerate(options):
            row = index // columns
            col = index % columns
            x = self.margin_x + col * col_width
            y = start_y - row * 15
            self.canvas.acroForm.checkbox(
                name=self._field_name(f"{key_prefix}_{option}"),
                tooltip=option,
                x=x,
                y=y,
                size=9,
                borderWidth=0.7,
                borderColor=colors.HexColor("#64748B"),
                fillColor=colors.white,
                textColor=colors.black,
                buttonStyle="check",
            )
            self.canvas.setFillColor(colors.HexColor("#334155"))
            self.canvas.setFont("Helvetica", 7.4)
            self.canvas.drawString(x + 13, y + 1, option[:44])
        self.y = start_y - rows * 15 - 8

    def table(self, key_prefix: str, label: str, columns: list[dict], *, rows: int = 4, row_height: float = 17) -> None:
        header_height = 15
        self.ensure_space(header_height + rows * row_height + 35)
        self.canvas.setFillColor(colors.HexColor("#1F2937"))
        self.canvas.setFont("Helvetica-Bold", 7.8)
        self.canvas.drawString(self.margin_x, self.y, label[:100])
        self.y -= 11
        total_units = sum(column.get("units", 1.0) for column in columns)
        col_widths = [self.content_width * (column.get("units", 1.0) / total_units) for column in columns]
        self.canvas.setFillColor(colors.HexColor("#E0E7FF"))
        self.canvas.rect(self.margin_x, self.y - header_height, self.content_width, header_height, stroke=0, fill=1)
        self.canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.canvas.setLineWidth(0.5)
        self.canvas.setFont("Helvetica-Bold", 6.7)
        x = self.margin_x
        for index, column in enumerate(columns):
            self.canvas.drawString(x + 2, self.y - 10, column["label"][:28])
            self.canvas.line(x, self.y, x, self.y - header_height - rows * row_height)
            x += col_widths[index]
        self.canvas.line(self.margin_x + self.content_width, self.y, self.margin_x + self.content_width, self.y - header_height - rows * row_height)
        for row_index in range(rows + 1):
            y = self.y - header_height - row_index * row_height
            self.canvas.line(self.margin_x, y, self.margin_x + self.content_width, y)
        for row_index in range(rows):
            x = self.margin_x
            top = self.y - header_height - row_index * row_height
            for col_index, column in enumerate(columns):
                self.canvas.acroForm.textfield(
                    name=self._field_name(f"{key_prefix}_{row_index + 1}_{column['key']}"),
                    tooltip=column["label"],
                    x=x + 1.5,
                    y=top - row_height + 2,
                    width=col_widths[col_index] - 3,
                    height=row_height - 4,
                    borderWidth=0,
                    fillColor=colors.white,
                    textColor=colors.black,
                    fontName="Helvetica",
                    fontSize=7,
                )
                x += col_widths[col_index]
        self.y -= header_height + rows * row_height + 15

    def signature_row(self, labels: list[str]) -> None:
        fields = [
            {"key": f"signature_{index + 1}", "label": label, "units": 1.0}
            for index, label in enumerate(labels)
        ]
        self.text_row(fields, height=21, gap=9)


def col(key: str, label: str, units: float = 1.0) -> dict:
    return {"key": key, "label": label, "units": units}


def field(key: str, label: str, units: float = 1.0, multiline: bool = False) -> dict:
    return {"key": key, "label": label, "units": units, "multiline": multiline}


def render_payment_lien_waiver(builder: PremiumBuilder) -> None:
    builder.note("Use this worksheet to prepare a pay application and conditional lien-waiver review. Substitute jurisdiction-specific waiver language before release.")
    builder.section("Project and Payment Application")
    builder.text_row([field("project_name", "Project name", 1.2), field("project_number", "Project / contract number", 0.8), field("application_number", "Application number", 0.55), field("period_end", "Period ending", 0.55)])
    builder.text_row([field("owner", "Owner", 1.0), field("general_contractor", "General contractor", 1.0), field("subcontractor", "Subcontractor / claimant", 1.0)])
    builder.text_row([field("contract_sum", "Original contract sum", 0.8), field("approved_changes", "Approved change orders", 0.8), field("revised_contract", "Revised contract sum", 0.8), field("retainage_rate", "Retainage %", 0.45)])
    builder.table(
        "payment_lines",
        "Payment line-item schedule",
        [
            col("line", "Line / scope", 1.25),
            col("scheduled", "Scheduled value", 0.8),
            col("previous", "Previous billed", 0.75),
            col("current", "This period", 0.75),
            col("stored", "Stored materials", 0.75),
            col("complete", "% complete", 0.55),
            col("balance", "Balance", 0.75),
        ],
        rows=8,
        row_height=16,
    )
    builder.text_row([field("subtotal_current", "Current earned subtotal", 0.8), field("less_retainage", "Less retainage", 0.65), field("tax_or_fees", "Tax / fees", 0.55), field("amount_requested", "Amount requested", 0.8)])
    builder.new_page()
    builder.section("Conditional Waiver Review")
    builder.checkboxes(
        "waiver_checks",
        "Waiver basis and exceptions",
        [
            "Progress payment",
            "Final payment",
            "Conditional on cleared funds",
            "Retention excluded",
            "Change orders excluded",
            "Stored materials excluded",
            "Claims reserved",
            "Lower-tier waivers attached",
        ],
        columns=2,
    )
    builder.text_row([field("through_date", "Waiver through date", 0.65), field("payment_amount", "Payment amount covered", 0.8), field("check_wire_reference", "Check / wire reference", 0.9), field("payment_received_date", "Date funds cleared", 0.75)])
    builder.textarea("reserved_claims", "Reserved claims, disputed amounts, exclusions, or unpaid lower-tier suppliers", height=50)
    builder.section("Certification")
    builder.textarea("certification_notes", "Certification notes, supporting attachments, and reviewer comments", height=46)
    builder.signature_row(["Claimant signature", "Authorized reviewer", "Date"])


def render_subcontractor_prequalification(builder: PremiumBuilder) -> None:
    builder.section("Company Profile")
    builder.text_row([field("legal_name", "Legal company name", 1.2), field("dba", "DBA", 0.8), field("tax_id_last4", "Tax ID last 4", 0.45), field("years_business", "Years in business", 0.5)])
    builder.text_row([field("primary_trade", "Primary trade / scope", 1.0), field("license_number", "License number", 0.75), field("license_state", "License state", 0.45), field("union_status", "Union / open shop", 0.6)])
    builder.text_row([field("contact_name", "Estimator / contact", 0.9), field("phone", "Phone", 0.6), field("email", "Email", 1.0), field("bonding_capacity", "Bonding capacity", 0.7)])
    builder.section("Insurance, Safety, and Capacity")
    builder.checkboxes(
        "documents",
        "Documents received",
        [
            "W-9",
            "Certificate of insurance",
            "License copy",
            "Bond letter",
            "Safety manual",
            "EMR letter",
            "OSHA logs",
            "Reference list",
            "Diversity certification",
            "Sample contract reviewed",
        ],
        columns=2,
    )
    builder.text_row([field("gl_limit", "General liability limit", 0.75), field("workers_comp", "Workers comp carrier", 0.9), field("auto_limit", "Auto liability limit", 0.75), field("emr", "EMR", 0.45), field("trir", "TRIR", 0.45)])
    builder.new_page()
    builder.table(
        "projects",
        "Comparable project experience",
        [
            col("project", "Project", 1.1),
            col("scope", "Scope", 1.1),
            col("contract", "Contract value", 0.65),
            col("gc_owner", "GC / owner", 0.9),
            col("contact", "Reference contact", 0.9),
        ],
        rows=5,
    )
    builder.section("Risk Review and Approval")
    builder.textarea("risk_notes", "Known exclusions, capacity constraints, disputed claims, safety concerns, or onboarding notes", height=54)
    builder.checkboxes("approval", "Approval recommendation", ["Approved", "Approved with limits", "Needs more documents", "Do not use", "Legal review", "Insurance review"], columns=3)
    builder.signature_row(["Estimator / PM", "Accounting / compliance", "Date"])


def render_job_hazard_analysis(builder: PremiumBuilder) -> None:
    builder.section("Task and Crew")
    builder.text_row([field("project_site", "Project / site", 1.1), field("task", "Task / activity", 1.0), field("date", "Date", 0.45), field("shift", "Shift", 0.45)])
    builder.text_row([field("foreman", "Foreman / lead", 0.85), field("crew_count", "Crew count", 0.4), field("weather", "Weather / conditions", 0.75), field("permit_number", "Permit number", 0.7)])
    builder.checkboxes(
        "permits",
        "Permits and controls",
        [
            "Hot work",
            "Confined space",
            "Electrical lockout",
            "Excavation",
            "Lift plan",
            "Traffic control",
            "Fall protection",
            "Crane / rigging",
            "Respiratory protection",
            "SDS reviewed",
            "Stop-work authority reviewed",
            "Emergency route reviewed",
        ],
        columns=3,
    )
    builder.table(
        "hazards",
        "Job steps, hazards, and controls",
        [
            col("step", "Task step", 1.15),
            col("hazard", "Hazard", 1.1),
            col("controls", "Controls / PPE", 1.25),
            col("owner", "Owner", 0.65),
            col("verified", "Verified", 0.45),
        ],
        rows=8,
        row_height=16,
    )
    builder.new_page()
    builder.section("Emergency and Closeout")
    builder.textarea("emergency_plan", "Emergency plan, nearest first aid / eyewash, muster point, and site-specific notes", height=44)
    builder.table("attendees", "Crew acknowledgement", [col("name", "Name", 1.1), col("company", "Company", 0.8), col("signature", "Signature", 1.0), col("time", "Time", 0.5)], rows=6, row_height=16)
    builder.signature_row(["Supervisor approval", "Safety review", "Date"])


def render_fleet_accident_report(builder: PremiumBuilder) -> None:
    builder.section("Incident Overview")
    builder.text_row([field("date_time", "Date and time", 0.7), field("location", "Exact location", 1.2), field("police_report", "Police report number", 0.75), field("claim_number", "Claim number", 0.7)])
    builder.text_row([field("driver_name", "Driver name", 0.9), field("employee_id", "Employee ID", 0.55), field("phone", "Phone", 0.55), field("license_state", "License state / number", 0.8)])
    builder.text_row([field("vehicle_unit", "Company vehicle / unit", 0.8), field("vin_plate", "VIN / plate", 0.8), field("odometer", "Odometer", 0.5), field("dashcam", "Dashcam / telematics ref", 0.8)])
    builder.checkboxes("incident_type", "Incident type", ["Collision", "Backing", "Cargo damage", "Injury", "Property damage", "Theft", "Weather related", "Towing required", "Drug test required", "DOT recordable"], columns=2)
    builder.section("Other Parties and Witnesses")
    builder.table(
        "parties",
        "Other drivers, owners, passengers, or witnesses",
        [
            col("name", "Name", 1.0),
            col("role", "Role", 0.55),
            col("phone", "Phone", 0.7),
            col("vehicle_property", "Vehicle / property", 1.1),
            col("insurance", "Insurance / report ref", 0.9),
        ],
        rows=5,
    )
    builder.new_page()
    builder.section("Damage, Injuries, and Statement")
    builder.textarea("damage_description", "Visible damage, cargo condition, injury notes, and immediate actions taken", height=54)
    builder.textarea("driver_statement", "Driver statement: direction of travel, speed, signals, road conditions, and sequence of events", height=70)
    builder.checkboxes("attachments", "Attachments collected", ["Photos", "Police report", "Insurance card", "Registration", "Witness statements", "Tow receipt", "Repair estimate", "Drug test record"], columns=2)
    builder.signature_row(["Driver signature", "Fleet manager review", "Date"])


def render_card_reconciliation(builder: PremiumBuilder) -> None:
    builder.section("Cardholder and Statement")
    builder.text_row([field("cardholder", "Cardholder", 1.0), field("department", "Department / cost center", 0.85), field("statement_period", "Statement period", 0.7), field("card_last4", "Card last 4", 0.45)])
    builder.text_row([field("manager", "Manager", 0.8), field("default_gl", "Default GL / project", 0.8), field("statement_total", "Statement total", 0.65), field("submitted_date", "Submitted date", 0.6)])
    builder.table(
        "transactions",
        "Transaction coding and receipt log",
        [
            col("date", "Date", 0.45),
            col("merchant", "Merchant", 1.0),
            col("business_purpose", "Business purpose", 1.25),
            col("gl_project", "GL / project", 0.65),
            col("amount", "Amount", 0.55),
            col("receipt", "Receipt?", 0.45),
        ],
        rows=9,
        row_height=15,
    )
    builder.section("Missing Receipt Certification")
    builder.checkboxes("missing_reason", "Reason receipt is unavailable", ["Lost", "Vendor did not provide", "Online receipt unavailable", "Receipt unreadable", "Travel / tip variance", "Other"], columns=3)
    builder.textarea("missing_details", "Missing receipt details, attempted recovery steps, and policy exception explanation", height=52)
    builder.checkboxes("policy_review", "Policy review", ["Purchases are business related", "No personal expenses", "No duplicate reimbursement", "Sales tax reviewed", "Receipt exceptions approved", "Coding complete"], columns=2)
    builder.signature_row(["Cardholder certification", "Manager approval", "Finance review"])


def render_timesheet_job_cost(builder: PremiumBuilder) -> None:
    builder.section("Employee and Week")
    builder.text_row([field("employee_name", "Employee name", 1.0), field("employee_id", "Employee ID", 0.55), field("department", "Department", 0.75), field("week_ending", "Week ending", 0.6)])
    builder.text_row([field("supervisor", "Supervisor", 0.9), field("default_job", "Default job / cost code", 0.85), field("pay_period", "Pay period", 0.65), field("submitted_date", "Submitted date", 0.55)])
    builder.table(
        "time_entries",
        "Daily time and job-cost allocation",
        [
            col("day", "Day / date", 0.55),
            col("job_code", "Job / cost code", 0.75),
            col("task", "Task / phase", 1.0),
            col("regular", "Regular", 0.5),
            col("overtime", "OT", 0.4),
            col("travel", "Travel", 0.45),
            col("per_diem", "Per diem / notes", 0.8),
        ],
        rows=10,
        row_height=15,
    )
    builder.section("Premiums, Leave, and Certification")
    builder.text_row([field("regular_total", "Regular total", 0.55), field("overtime_total", "Overtime total", 0.55), field("pto_hours", "PTO / sick hours", 0.6), field("unpaid_hours", "Unpaid hours", 0.55), field("total_hours", "Total hours", 0.55)])
    builder.checkboxes("attestation", "Employee attestation", ["All hours recorded", "Meal periods recorded", "Overtime authorized", "Travel time included", "Corrections explained", "Receipts attached"], columns=3)
    builder.textarea("corrections", "Corrections, missed punches, payroll notes, or supervisor comments", height=48)
    builder.signature_row(["Employee signature", "Supervisor approval", "Payroll review"])


def render_chain_temp_excursion(builder: PremiumBuilder) -> None:
    builder.section("Shipment and Product")
    builder.text_row([field("shipment_id", "Shipment / order ID", 0.8), field("customer", "Customer / consignee", 1.0), field("product", "Product / lot", 1.0), field("required_range", "Required temp range", 0.7)])
    builder.text_row([field("origin", "Origin", 0.85), field("destination", "Destination", 0.85), field("carrier", "Carrier", 0.7), field("equipment", "Trailer / container", 0.65)])
    builder.checkboxes("product_status", "Product status", ["Released", "Quarantined", "Rejected", "Returned", "Partial hold", "QA review", "Customer notified", "Regulatory review"], columns=2)
    builder.table(
        "handoff",
        "Chain-of-custody handoff log",
        [
            col("time", "Date / time", 0.65),
            col("from_party", "Released by", 0.9),
            col("to_party", "Received by", 0.9),
            col("condition", "Seal / condition", 0.85),
            col("signature", "Signature", 0.9),
        ],
        rows=6,
        row_height=16,
    )
    builder.table(
        "readings",
        "Temperature readings and excursion review",
        [
            col("time", "Time", 0.5),
            col("location", "Location / logger", 0.9),
            col("reading", "Reading", 0.55),
            col("duration", "Duration", 0.55),
            col("action", "Corrective action", 1.15),
            col("initials", "Initials", 0.45),
        ],
        rows=7,
        row_height=15,
    )
    builder.textarea("qa_assessment", "QA assessment, product disposition rationale, customer notification, and CAPA link", height=52)
    builder.signature_row(["QA release / hold decision", "Operations review", "Date"])


def render_supplier_8d(builder: PremiumBuilder) -> None:
    builder.section("Problem Identification")
    builder.text_row([field("scar_number", "SCAR / NCR number", 0.75), field("supplier", "Supplier", 1.0), field("part_number", "Part / item number", 0.85), field("lot_serial", "Lot / serial", 0.75)])
    builder.text_row([field("issue_date", "Issue date", 0.5), field("response_due", "Response due", 0.5), field("quantity_affected", "Quantity affected", 0.6), field("detected_at", "Detected at", 0.75), field("severity", "Severity", 0.45)])
    builder.textarea("problem_statement", "D2 problem statement: what failed, where found, requirement not met, evidence, and customer impact", height=56)
    builder.section("Containment and Root Cause")
    builder.table(
        "containment",
        "D3 containment actions",
        [
            col("action", "Action", 1.2),
            col("owner", "Owner", 0.6),
            col("due", "Due", 0.45),
            col("status", "Status", 0.55),
            col("evidence", "Evidence / lot scope", 1.0),
        ],
        rows=5,
    )
    builder.textarea("root_cause", "D4 root cause analysis: escape cause, occurrence cause, 5-why / fishbone notes", height=58)
    builder.new_page()
    builder.section("Corrective Action and Verification")
    builder.table(
        "corrective_actions",
        "D5-D7 corrective and preventive actions",
        [
            col("action", "Action", 1.2),
            col("owner", "Owner", 0.55),
            col("due", "Due", 0.45),
            col("effectiveness", "Effectiveness check", 1.0),
            col("closed", "Closed?", 0.45),
        ],
        rows=6,
    )
    builder.textarea("verification", "Verification results, updated documents, training, control-plan changes, and recurrence monitoring", height=50)
    builder.signature_row(["Supplier quality", "Supplier representative", "Closure date"])


def render_sponsorship_deliverables(builder: PremiumBuilder) -> None:
    builder.section("Sponsor and Event")
    builder.text_row([field("sponsor_name", "Sponsor organization", 1.1), field("contact", "Sponsor contact", 0.8), field("email", "Email", 0.9), field("phone", "Phone", 0.55)])
    builder.text_row([field("event_name", "Event / campaign", 1.0), field("event_date", "Event date", 0.55), field("sponsorship_level", "Sponsorship level", 0.75), field("pledge_amount", "Pledge amount", 0.6)])
    builder.checkboxes("benefits", "Sponsor benefits requested", ["Logo on website", "Logo on signage", "Booth / table", "Speaking slot", "Social post", "Email mention", "Tickets included", "Program ad", "In-kind benefits", "Custom package"], columns=2)
    builder.new_page()
    builder.section("Payment, Assets, and Deliverables")
    builder.text_row([field("invoice_number", "Invoice number", 0.65), field("payment_due", "Payment due", 0.55), field("payment_status", "Payment status", 0.7), field("logo_due", "Logo / artwork due", 0.75)])
    builder.table(
        "deliverables",
        "Deliverables tracker",
        [
            col("deliverable", "Deliverable", 1.15),
            col("owner", "Owner", 0.65),
            col("due", "Due", 0.45),
            col("asset_needed", "Asset needed", 0.85),
            col("complete", "Complete / proof", 0.95),
        ],
        rows=7,
        row_height=16,
    )
    builder.section("Terms and Approvals")
    builder.textarea("terms", "Restrictions, recognition language, refund policy, exclusivity, and internal notes", height=56)
    builder.checkboxes("review", "Review checklist", ["Brand approved", "Tax receipt needed", "Benefits documented", "Invoice sent", "Assets received", "Post-event report needed"], columns=2)
    builder.signature_row(["Sponsor representative", "Organization approval", "Date"])


def render_rental_deposit_reconciliation(builder: PremiumBuilder) -> None:
    builder.section("Lease and Move-Out Details")
    builder.text_row([field("property", "Property / unit", 1.0), field("tenant", "Tenant(s)", 1.0), field("lease_end", "Lease end", 0.55), field("move_out_date", "Move-out date", 0.55)])
    builder.text_row([field("forwarding_address", "Forwarding address", 1.3), field("deposit_amount", "Deposit held", 0.6), field("notice_deadline", "Notice deadline", 0.65), field("ledger_balance", "Ledger balance", 0.55)])
    builder.checkboxes("moveout_items", "Move-out items received", ["Keys returned", "Garage opener", "Forwarding address", "Utilities final", "Photos taken", "Cleaning invoice", "Repair invoice", "Tenant dispute noted"], columns=2)
    builder.section("Condition and Charge Schedule")
    builder.table(
        "charges",
        "Deposit deductions and supporting documentation",
        [
            col("area", "Area / item", 0.9),
            col("condition", "Condition / charge basis", 1.25),
            col("normal_wear", "Wear?", 0.45),
            col("vendor", "Vendor / receipt", 0.9),
            col("amount", "Amount", 0.55),
            col("tenant_share", "Tenant share", 0.6),
        ],
        rows=8,
        row_height=16,
    )
    builder.section("Refund and Notice")
    builder.text_row([field("total_deductions", "Total deductions", 0.7), field("refund_due", "Refund due", 0.65), field("amount_owed", "Amount owed by tenant", 0.75), field("notice_sent", "Notice sent date", 0.65)])
    builder.textarea("explanation", "Plain-language explanation for tenant notice, dispute notes, and file references", height=58)
    builder.signature_row(["Property manager", "Owner / reviewer", "Date"])


TEMPLATES: tuple[PremiumTemplate, ...] = (
    PremiumTemplate(
        "construction_trades",
        "DCT 2700",
        "Contractor Payment Application and Conditional Lien Waiver Worksheet",
        "Premium construction payment packet with a pay-application schedule, retainage summary, waiver exceptions, and approval certification.",
        "Use this original DullyPDF template to prepare contractor payment applications and conditional lien-waiver review notes.",
        "Best for project managers who need a reusable fillable packet for progress billing, retainage, waiver exceptions, and owner approval routing.",
        render_payment_lien_waiver,
    ),
    PremiumTemplate(
        "construction_trades",
        "DCT 2701",
        "Subcontractor Prequalification Packet",
        "Premium construction onboarding packet for license, insurance, bonding, safety, capacity, project history, and approval review.",
        "Use this original DullyPDF template to prequalify subcontractors before bid invitations or project onboarding.",
        "Best for contractors replacing ad hoc email collection with a structured vendor-risk review and reusable Search & Fill schema.",
        render_subcontractor_prequalification,
    ),
    PremiumTemplate(
        "safety_compliance",
        "DSC 2700",
        "Job Hazard Analysis and Pre-Task Plan",
        "Premium safety planning form for crew briefings, hazard controls, permits, PPE, emergency notes, and acknowledgement signatures.",
        "Use this original DullyPDF template to document job hazard analysis and pre-task planning before field work starts.",
        "Best for daily safety briefings where crews need consistent hazard controls, sign-off, and closeout evidence.",
        render_job_hazard_analysis,
    ),
    PremiumTemplate(
        "automotive_service",
        "DAS 2700",
        "Fleet Vehicle Accident Report and Driver Statement",
        "Premium fleet incident packet for accident details, driver statement, witnesses, vehicle damage, police reports, and claims review.",
        "Use this original DullyPDF template to document fleet vehicle accidents and route claims to safety, fleet, or insurance teams.",
        "Best for transportation, delivery, and service companies standardizing post-incident evidence collection.",
        render_fleet_accident_report,
    ),
    PremiumTemplate(
        "finance_accounting",
        "DFA 2700",
        "Corporate Card Reconciliation and Missing Receipt Form",
        "Premium accounting packet for card coding, business purpose, missing receipt certification, policy review, and manager approval.",
        "Use this original DullyPDF template to reconcile corporate card statements and document missing receipt exceptions.",
        "Best for finance teams collecting line-item GL coding, receipt evidence, and policy certifications before month-end close.",
        render_card_reconciliation,
    ),
    PremiumTemplate(
        "hr_operations",
        "DHO 2700",
        "Employee Weekly Timesheet and Job Cost Allocation",
        "Premium payroll packet for weekly hours, job-cost codes, overtime, travel, per diem, corrections, and approval workflow.",
        "Use this original DullyPDF template to collect employee weekly time and allocate labor to jobs or cost centers.",
        "Best for contractors, agencies, and field teams that need signed time records with payroll and project-cost detail.",
        render_timesheet_job_cost,
    ),
    PremiumTemplate(
        "logistics_transport",
        "DLT 2700",
        "Chain of Custody and Temperature Excursion Report",
        "Premium logistics quality packet for controlled shipments, custody handoffs, temperature readings, excursions, and QA disposition.",
        "Use this original DullyPDF template to track chain of custody and temperature excursions for sensitive shipments.",
        "Best for food, pharma, lab, and cold-chain workflows where handoff evidence and release decisions need one fillable record.",
        render_chain_temp_excursion,
    ),
    PremiumTemplate(
        "manufacturing_quality",
        "DMQ 2700",
        "Supplier Corrective Action Request 8D Report",
        "Premium quality packet for supplier nonconformance, containment, root cause, corrective action, verification, and closure.",
        "Use this original DullyPDF template to issue and close supplier corrective action requests using an 8D-style structure.",
        "Best for manufacturing and quality teams that need a fillable SCAR record with containment and effectiveness tracking.",
        render_supplier_8d,
    ),
    PremiumTemplate(
        "nonprofit_events",
        "DNE 2700",
        "Event Sponsorship Agreement Intake and Deliverables Tracker",
        "Premium nonprofit and event packet for sponsor commitments, benefits, assets, invoices, deliverables, and approvals.",
        "Use this original DullyPDF template to manage event sponsorship intake, recognition benefits, and deliverable tracking.",
        "Best for nonprofits and event teams converting sponsorship commitments into accountable tasks and signed approvals.",
        render_sponsorship_deliverables,
    ),
    PremiumTemplate(
        "real_estate_property",
        "DPM 2700",
        "Rental Turnover and Security Deposit Reconciliation",
        "Premium property packet for move-out condition, deposit deductions, receipts, notices, refund calculations, and dispute notes.",
        "Use this original DullyPDF template to reconcile security deposits after rental turnover and document supporting charges.",
        "Best for property managers who need consistent deduction evidence, refund math, and tenant notice preparation.",
        render_rental_deposit_reconciliation,
    ),
)


def load_json(path: Path, default: dict) -> dict:
    if not path.exists():
        return default
    return json.loads(path.read_text())


def write_json(path: Path, payload: dict) -> None:
    path.write_text(f"{json.dumps(payload, indent=2, ensure_ascii=False)}\n")


def metadata_entry(spec: PremiumTemplate) -> dict:
    return {
        "filename": spec.filename,
        "form_number": spec.form_number,
        "title": spec.title,
        "url": "",
    }


def upsert_metadata() -> None:
    metadata = load_json(METADATA_PATH, {})
    for spec in TEMPLATES:
        section_entries = metadata.setdefault(spec.section, [])
        section_entries = [
            entry
            for entry in section_entries
            if entry.get("filename") != spec.filename and entry.get("form_number") != spec.form_number
        ]
        section_entries.append(metadata_entry(spec))
        section_entries.sort(key=lambda entry: (entry.get("form_number", ""), entry.get("filename", "")))
        metadata[spec.section] = section_entries
    write_json(METADATA_PATH, dict(sorted(metadata.items())))


def upsert_descriptions() -> None:
    payload = load_json(
        DESCRIPTIONS_PATH,
        {
            "_note": "Keyed by '<section>/<filename>'. Each value: { description, useCase }.",
            "_entries": {},
        },
    )
    entries = payload.setdefault("_entries", {})
    for spec in TEMPLATES:
        entries[f"{spec.section}/{spec.filename}"] = {
            "description": spec.description,
            "useCase": spec.use_case,
        }
    write_json(DESCRIPTIONS_PATH, payload)


def render_template(spec: PremiumTemplate) -> None:
    out_dir = CATALOG_ROOT / spec.section
    out_dir.mkdir(parents=True, exist_ok=True)
    pdf_path = out_dir / spec.filename
    c = canvas.Canvas(str(pdf_path), pagesize=letter, invariant=1, pageCompression=1)
    builder = PremiumBuilder(c, spec)
    spec.renderer(builder)
    builder.save()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate premium first-party form catalog PDFs.")
    parser.add_argument(
        "--catalog-root",
        default=str(CATALOG_ROOT),
        help="Directory containing form catalog PDFs and metadata.",
    )
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Refresh local_generated_forms.json and descriptions.json without rewriting PDFs.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    global CATALOG_ROOT, METADATA_PATH, DESCRIPTIONS_PATH
    CATALOG_ROOT = Path(args.catalog_root).resolve()
    METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"
    DESCRIPTIONS_PATH = CATALOG_ROOT / "descriptions.json"
    if not CATALOG_ROOT.exists():
        raise SystemExit(f"Catalog root does not exist: {CATALOG_ROOT}")

    upsert_metadata()
    upsert_descriptions()
    if not args.metadata_only:
        for spec in TEMPLATES:
            render_template(spec)
            print(f"[generate-premium-catalog] generated {spec.section}/{spec.filename}")
    print(f"[generate-premium-catalog] registered {len(TEMPLATES)} premium templates")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
