#!/usr/bin/env python3
"""Generate original long-tail PDF form templates for the public catalog.

The catalog already mirrors public-domain government PDFs and first-party
practice-intake templates. This generator adds first-party operational
templates for search-heavy, lower-competition PDF form intents such as work
orders, inspections, permission slips, donation pledges, logistics receipts,
and quality checklists. Runtime is O(s * c * w), where s is the number of
sections and c * w is the context/workflow cross product used to reach each
section's target count.
"""

from __future__ import annotations

import json
import re
import argparse
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = ROOT / "form_catalog"
METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"
PAGE_WIDTH, PAGE_HEIGHT = letter


@dataclass(frozen=True)
class WorkflowSpec:
    suffix: str
    kind: str
    prompt: str
    checklist: tuple[str, ...]


@dataclass(frozen=True)
class SectionSpec:
    key: str
    prefix: str
    start_number: int
    count: int
    label: str
    subtitle: str
    party_label: str
    subject_label: str
    contexts: tuple[str, ...]
    workflows: tuple[WorkflowSpec, ...]
    common_checklist: tuple[str, ...]


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def metadata_entry(section: str, form_number: str, title: str) -> dict:
    return {
        "filename": f"{slugify(form_number)}__{slugify(title)}.pdf",
        "form_number": form_number,
        "title": title,
        "url": "",
    }


def build_title(context: str, suffix: str) -> str:
    context_clean = context.strip()
    suffix_clean = suffix.strip()
    context_lower = context_clean.lower()
    suffix_lower = suffix_clean.lower()
    if suffix_lower.startswith(context_lower):
        return suffix_clean

    context_tokens = context_lower.split()
    suffix_tokens = suffix_clean.split()
    if context_tokens and suffix_tokens and context_tokens[-1] == suffix_tokens[0].lower():
        suffix_tail = " ".join(suffix_tokens[1:])
        return f"{context_clean} {suffix_tail}".strip()

    return f"{context_clean} {suffix_clean}"


def draw_label(c: canvas.Canvas, x: float, y: float, text: str) -> None:
    c.setFillColor(colors.HexColor("#1E293B"))
    c.setFont("Helvetica", 8.2)
    c.drawString(x, y, text[:72])


def text_field(
    c: canvas.Canvas,
    name: str,
    label: str,
    x: float,
    y: float,
    width: float,
    height: float = 18,
    multiline: bool = False,
) -> None:
    draw_label(c, x, y + height + 3, label)
    kwargs = {"fieldFlags": "multiline"} if multiline else {}
    c.acroForm.textfield(
        name=name,
        tooltip=label,
        x=x,
        y=y,
        width=width,
        height=height,
        borderStyle="solid",
        borderColor=colors.HexColor("#94A3B8"),
        fillColor=colors.HexColor("#F8FAFC"),
        textColor=colors.black,
        fontName="Helvetica",
        fontSize=8.5,
        **kwargs,
    )


def checkbox(c: canvas.Canvas, name: str, label: str, x: float, y: float) -> None:
    c.acroForm.checkbox(
        name=name,
        tooltip=label,
        x=x,
        y=y,
        size=9,
        borderWidth=0.7,
        borderColor=colors.HexColor("#64748B"),
        fillColor=colors.white,
        textColor=colors.black,
        buttonStyle="check",
    )
    c.setFillColor(colors.HexColor("#334155"))
    c.setFont("Helvetica", 8)
    c.drawString(x + 13, y + 1, label[:42])


def section_header(c: canvas.Canvas, title: str, y: float) -> float:
    c.setFillColor(colors.HexColor("#E2E8F0"))
    c.roundRect(0.55 * inch, y - 14, PAGE_WIDTH - 1.1 * inch, 16, 4, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 9.5)
    c.drawString(0.65 * inch, y - 9, title)
    return y - 28


def table(
    c: canvas.Canvas,
    prefix: str,
    y: float,
    columns: tuple[str, ...],
    rows: int = 5,
) -> float:
    x0 = 0.65 * inch
    width = PAGE_WIDTH - 1.3 * inch
    header_h = 15
    row_h = 17
    col_w = width / len(columns)
    c.setFillColor(colors.HexColor("#EFF6FF"))
    c.rect(x0, y - header_h, width, header_h, stroke=0, fill=1)
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.setFont("Helvetica-Bold", 7.5)
    for index, label in enumerate(columns):
        x = x0 + index * col_w
        c.drawString(x + 3, y - 10, label[:23])
        c.line(x, y, x, y - header_h - rows * row_h)
    c.line(x0 + width, y, x0 + width, y - header_h - rows * row_h)
    for row in range(rows + 1):
        row_y = y - header_h - row * row_h
        c.line(x0, row_y, x0 + width, row_y)
    for row in range(rows):
        for index, label in enumerate(columns):
            x = x0 + index * col_w + 2
            field_name = f"{prefix}_row_{row + 1}_{slugify(label)}"
            c.acroForm.textfield(
                name=field_name,
                tooltip=label,
                x=x,
                y=y - header_h - (row + 1) * row_h + 2,
                width=col_w - 4,
                height=row_h - 4,
                borderWidth=0,
                fillColor=colors.white,
                textColor=colors.black,
                fontName="Helvetica",
                fontSize=7.5,
            )
    return y - header_h - rows * row_h - 18


def columns_for_kind(kind: str) -> tuple[str, ...]:
    if kind == "inspection":
        return ("Area / item", "Pass", "Issue found", "Corrective action")
    if kind == "log":
        return ("Date", "Entry", "Status / reading", "Notes")
    if kind == "request":
        return ("Requested item", "Priority", "Owner", "Due date")
    if kind == "finance":
        return ("Document / line item", "Amount", "Status", "Notes")
    if kind == "people":
        return ("Participant / employee", "Role", "Contact", "Status")
    return ("Task / item", "Assigned to", "Status", "Notes")


def render_pdf(section: SectionSpec, entry: dict, workflow: WorkflowSpec, context: str) -> None:
    out_dir = CATALOG_ROOT / section.key
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / entry["filename"]
    field_prefix = slugify(entry["form_number"])
    c = canvas.Canvas(str(path), pagesize=letter, invariant=1, pageCompression=1)

    margin = 0.55 * inch
    c.setFillColor(colors.HexColor("#DBEAFE"))
    c.roundRect(margin, PAGE_HEIGHT - 0.95 * inch, PAGE_WIDTH - 2 * margin, 0.48 * inch, 8, stroke=0, fill=1)
    c.setFillColor(colors.HexColor("#0F172A"))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(0.72 * inch, PAGE_HEIGHT - 0.68 * inch, entry["title"][:72])
    c.setFont("Helvetica-Bold", 8.5)
    c.drawRightString(PAGE_WIDTH - 0.72 * inch, PAGE_HEIGHT - 0.68 * inch, entry["form_number"])
    c.setFillColor(colors.HexColor("#475569"))
    c.setFont("Helvetica", 8)
    c.drawString(0.65 * inch, PAGE_HEIGHT - 1.06 * inch, section.subtitle[:126])

    y = PAGE_HEIGHT - 1.35 * inch
    y = section_header(c, "Contact and Form Context", y)
    text_field(c, f"{field_prefix}_contact_name", section.party_label, 0.65 * inch, y - 18, 2.0 * inch)
    text_field(c, f"{field_prefix}_phone", "Phone", 2.85 * inch, y - 18, 1.25 * inch)
    text_field(c, f"{field_prefix}_email", "Email", 4.25 * inch, y - 18, 1.75 * inch)
    text_field(c, f"{field_prefix}_date", "Date", 6.15 * inch, y - 18, 0.8 * inch)
    y -= 48
    text_field(c, f"{field_prefix}_subject", section.subject_label, 0.65 * inch, y - 18, 2.35 * inch)
    text_field(c, f"{field_prefix}_location", "Location / account / job ID", 3.2 * inch, y - 18, 2.0 * inch)
    text_field(c, f"{field_prefix}_priority", "Priority / target date", 5.4 * inch, y - 18, 1.55 * inch)

    y -= 54
    y = section_header(c, "Details", y)
    text_field(
        c,
        f"{field_prefix}_summary",
        workflow.prompt,
        0.65 * inch,
        y - 54,
        PAGE_WIDTH - 1.3 * inch,
        height=48,
        multiline=True,
    )
    y -= 78

    y = section_header(c, "Checklist and Review Items", y)
    options = list(dict.fromkeys((*workflow.checklist, *section.common_checklist)))[:8]
    for index, option in enumerate(options):
        col = index % 2
        row = index // 2
        checkbox(
            c,
            f"{field_prefix}_check_{index + 1}",
            option,
            0.75 * inch + col * 3.35 * inch,
            y - row * 17,
        )
    y -= 88

    y = section_header(c, "Line Items, Log, or Follow-Up", y)
    y = table(c, f"{field_prefix}_table", y, columns_for_kind(workflow.kind), rows=5)

    y = section_header(c, "Approval and Sign-Off", y)
    text_field(c, f"{field_prefix}_prepared_by", "Prepared by", 0.65 * inch, y - 18, 1.9 * inch)
    text_field(c, f"{field_prefix}_reviewed_by", "Reviewed / approved by", 2.8 * inch, y - 18, 1.9 * inch)
    text_field(c, f"{field_prefix}_signature", "Signature", 4.95 * inch, y - 18, 1.2 * inch)
    text_field(c, f"{field_prefix}_signed_date", "Date", 6.35 * inch, y - 18, 0.6 * inch)

    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.line(0.65 * inch, 0.62 * inch, PAGE_WIDTH - 0.65 * inch, 0.62 * inch)
    c.setFillColor(colors.HexColor("#64748B"))
    c.setFont("Helvetica", 7)
    c.drawString(
        0.65 * inch,
        0.46 * inch,
        "DullyPDF original blank template. Review local legal, safety, privacy, and record-retention requirements before production use.",
    )
    c.save()


def cleanup_stale_managed_files(section: SectionSpec, generated_entries: list[dict]) -> None:
    out_dir = CATALOG_ROOT / section.key
    if not out_dir.exists():
        return
    expected_pdfs = {entry["filename"] for entry in generated_entries}
    expected_webps = {Path(entry["filename"]).with_suffix(".webp").name for entry in generated_entries}
    for entry in generated_entries:
        number_prefix = slugify(entry["form_number"])
        for stale_pdf in out_dir.glob(f"{number_prefix}__*.pdf"):
            if stale_pdf.name not in expected_pdfs:
                stale_pdf.unlink()
        for stale_webp in out_dir.glob(f"{number_prefix}__*.webp"):
            if stale_webp.name not in expected_webps:
                stale_webp.unlink()


def workflow(suffix: str, kind: str, prompt: str, checklist: tuple[str, ...]) -> WorkflowSpec:
    return WorkflowSpec(suffix=suffix, kind=kind, prompt=prompt, checklist=checklist)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate original long-tail form catalog templates.",
    )
    parser.add_argument(
        "--catalog-root",
        default=str(CATALOG_ROOT),
        help="Directory that stores local form_catalog PDFs and metadata.",
    )
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="Refresh local_generated_forms.json entries without rewriting PDFs.",
    )
    return parser.parse_args()


SECTIONS: tuple[SectionSpec, ...] = (
    SectionSpec(
        key="construction_trades",
        prefix="DCT",
        start_number=1000,
        count=63,
        label="Construction & Trades",
        subtitle="Original blank templates for contractors, remodelers, specialty trades, job documentation, estimates, and field sign-off workflows.",
        party_label="Customer / requester",
        subject_label="Project / trade",
        contexts=("General Contractor", "Home Remodel", "Roofing", "HVAC Installation", "Plumbing", "Electrical", "Painting", "Flooring", "Concrete", "Landscaping", "Solar Installation", "Pool Construction", "Excavation", "Drywall", "Cabinet Installation"),
        workflows=(
            workflow("Estimate Request Form", "request", "Describe the requested scope, site constraints, measurements, and target timeline.", ("Scope reviewed", "Photos attached", "Measurements needed", "Permit question")),
            workflow("Work Order Form", "task", "Describe the authorized work, crew instructions, materials, and customer expectations.", ("Customer approved", "Crew assigned", "Materials staged", "Access confirmed")),
            workflow("Change Order Request Form", "finance", "Describe the requested change, cost impact, schedule impact, and approval notes.", ("Original scope referenced", "Price impact reviewed", "Schedule impact reviewed", "Signature required")),
            workflow("Daily Job Report Form", "log", "Summarize work completed today, crew count, deliveries, delays, and open issues.", ("Weather noted", "Crew hours logged", "Deliveries recorded", "Delays documented")),
            workflow("Punch List Checklist Form", "inspection", "List remaining finish items, owner notes, responsible party, and closeout status.", ("Owner walkthrough done", "Photos taken", "Responsible trade assigned", "Retainage item")),
            workflow("Safety Walk Checklist Form", "inspection", "Record hazards, controls, PPE, site access, and corrective actions.", ("PPE checked", "Fall protection checked", "Electrical hazard checked", "Housekeeping checked")),
            workflow("Material Request Form", "request", "List needed materials, quantities, vendor preferences, delivery constraints, and approvals.", ("Quantity verified", "Vendor selected", "Delivery date set", "Budget checked")),
        ),
        common_checklist=("Needs follow-up", "Attach photos", "Owner approval needed", "Update project file"),
    ),
    SectionSpec(
        key="field_service",
        prefix="DFS",
        start_number=1100,
        count=63,
        label="Field Service",
        subtitle="Original blank templates for service calls, onsite repairs, job completion, technician findings, warranty intake, and customer approvals.",
        party_label="Customer / site contact",
        subject_label="Service type / asset",
        contexts=("Appliance Repair", "Pest Control", "Lawn Care", "Cleaning Service", "Locksmith", "Garage Door", "Septic Service", "Window Cleaning", "Mobile Mechanic", "Onsite IT", "Security System", "Elevator Service", "Fire Alarm", "Water Damage", "Janitorial"),
        workflows=(
            workflow("Service Call Intake Form", "request", "Capture the service issue, access notes, symptoms, urgency, and preferred appointment window.", ("Issue described", "Access available", "Preferred time listed", "Warranty question")),
            workflow("Job Work Order Form", "task", "Document assigned work, diagnosis, parts, labor, and customer approval.", ("Diagnosis recorded", "Parts listed", "Labor estimated", "Customer approval")),
            workflow("Preventive Maintenance Checklist Form", "inspection", "Record maintenance checks, readings, cleaning, adjustments, and recommended follow-up.", ("Visual inspection", "Safety check", "Cleaning complete", "Next service due")),
            workflow("Customer Completion Sign-Off Form", "task", "Summarize completed work, customer notes, remaining issues, and acceptance.", ("Work complete", "Area cleaned", "Customer walked through", "Payment note")),
            workflow("Warranty Request Form", "request", "Describe the warranty issue, purchase or install date, prior repairs, and supporting details.", ("Proof available", "Serial number recorded", "Prior repair noted", "Photo attached")),
            workflow("Equipment Inspection Report Form", "inspection", "Record asset condition, defects, safety concerns, and recommended service actions.", ("Asset tagged", "Defect noted", "Safety concern", "Quote needed")),
            workflow("Follow-Up Visit Checklist Form", "log", "Track follow-up findings, repeated symptoms, corrective action, and next steps.", ("Prior ticket reviewed", "Symptoms retested", "Customer updated", "Closeout ready")),
        ),
        common_checklist=("Needs estimate", "Needs parts", "Needs manager review", "Schedule follow-up"),
    ),
    SectionSpec(
        key="facilities_maintenance",
        prefix="DFM",
        start_number=1200,
        count=63,
        label="Facilities & Maintenance",
        subtitle="Original blank templates for building systems, preventive maintenance, tenant requests, vendor visits, inspections, and facilities logs.",
        party_label="Requester / facility contact",
        subject_label="Building / asset",
        contexts=("HVAC Rooftop Unit", "Boiler", "Chiller", "Fire Extinguisher", "Elevator", "Generator", "Lighting", "Plumbing", "Roof Leak", "Janitorial", "Access Control", "Parking Lot", "Building Safety", "Restroom", "Breakroom"),
        workflows=(
            workflow("Inspection Checklist Form", "inspection", "Record condition, compliance items, defects, priority, and corrective action.", ("Condition checked", "Defect noted", "Photo needed", "Repair priority")),
            workflow("Preventive Maintenance Log Form", "log", "Track service steps, readings, parts replaced, and next maintenance date.", ("Reading recorded", "Filter / consumable checked", "Lubrication checked", "Next date set")),
            workflow("Repair Request Form", "request", "Describe the issue, location, impact, access instructions, and desired response time.", ("Urgency set", "Tenant impacted", "Access noted", "Vendor needed")),
            workflow("Vendor Sign-In Form", "people", "Record vendor arrival, purpose, escort, insurance status, and checkout.", ("Badge issued", "Escort assigned", "Insurance checked", "Checked out")),
            workflow("Asset Register Form", "log", "Capture asset details, serial number, location, warranty, and maintenance ownership.", ("Serial captured", "Location confirmed", "Warranty noted", "Owner assigned")),
            workflow("Incident Report Form", "inspection", "Document event details, affected area, immediate response, witnesses, and follow-up.", ("Area secured", "Witness noted", "Manager notified", "Corrective action")),
            workflow("Cleaning Checklist Form", "inspection", "Track cleaning tasks, supply needs, missed areas, and supervisor review.", ("High-touch surfaces", "Supplies restocked", "Waste removed", "Supervisor review")),
        ),
        common_checklist=("Add to maintenance log", "Notify occupant", "Create work order", "Close after verification"),
    ),
    SectionSpec(
        key="property_management",
        prefix="DPM",
        start_number=1300,
        count=63,
        label="Property Management",
        subtitle="Original blank templates for rental operations, tenant requests, inspections, move-in/move-out workflows, and property records.",
        party_label="Tenant / applicant / owner",
        subject_label="Property / unit",
        contexts=("Apartment", "Single Family Rental", "Duplex", "Condo", "HOA", "Short-Term Rental", "Commercial Suite", "Student Housing", "Senior Housing", "Storage Unit", "Parking Space", "Laundry Room", "Shared Amenity", "Move-In", "Move-Out"),
        workflows=(
            workflow("Maintenance Request Form", "request", "Describe the repair issue, access permission, urgency, photos, and preferred contact method.", ("Emergency?", "Access permission", "Photo attached", "Tenant notified")),
            workflow("Move-In Condition Checklist Form", "inspection", "Record condition at move-in, room-by-room notes, keys issued, and tenant acknowledgment.", ("Photos taken", "Keys issued", "Meter read", "Tenant signed")),
            workflow("Move-Out Inspection Form", "inspection", "Record move-out condition, cleaning status, damages, charges, and follow-up.", ("Forwarding address", "Keys returned", "Photos taken", "Deposit review")),
            workflow("Lease Renewal Request Form", "request", "Capture renewal preference, term, rent change, occupant changes, and approval notes.", ("Term selected", "Rent reviewed", "Occupants updated", "Approval needed")),
            workflow("Pet Screening Form", "people", "Collect pet details, vaccination notes, assistance-animal workflow notes, and property rules.", ("Pet photo", "Vaccination record", "Rules reviewed", "Fee reviewed")),
            workflow("Tenant Complaint Form", "inspection", "Document concern details, timing, parties involved, evidence, and response plan.", ("Manager notified", "Evidence attached", "Response due", "Follow-up scheduled")),
            workflow("Property Walkthrough Report Form", "inspection", "Track inspection findings, preventive maintenance, resident notes, and owner updates.", ("Exterior checked", "Interior checked", "Safety checked", "Owner update")),
        ),
        common_checklist=("Needs owner approval", "Needs tenant update", "Attach photos", "Update property file"),
    ),
    SectionSpec(
        key="manufacturing_quality",
        prefix="DMQ",
        start_number=1400,
        count=63,
        label="Manufacturing & Quality",
        subtitle="Original blank templates for production, quality control, corrective action, supplier review, calibration, and shift handoff workflows.",
        party_label="Operator / inspector",
        subject_label="Part / line / batch",
        contexts=("Incoming Material", "First Article", "In-Process Quality", "Final Inspection", "Nonconformance", "Corrective Action", "Calibration", "Line Startup", "Batch Record", "Supplier Audit", "Tooling Change", "Scrap Review", "Packaging", "Shift Handoff", "Work Instruction"),
        workflows=(
            workflow("Inspection Checklist Form", "inspection", "Record inspection criteria, sample size, result, defect notes, and disposition.", ("Spec reviewed", "Sample checked", "Defect found", "Disposition set")),
            workflow("Quality Report Form", "inspection", "Summarize quality findings, measurements, nonconformances, and next actions.", ("Measurement recorded", "Trend noted", "Supervisor review", "Containment needed")),
            workflow("Production Log Form", "log", "Track production run details, counts, downtime, scrap, and operator notes.", ("Run started", "Downtime logged", "Scrap counted", "Shift note")),
            workflow("Corrective Action Request Form", "request", "Describe issue, root-cause notes, containment, corrective action, owner, and due date.", ("Containment assigned", "Root cause needed", "Owner assigned", "Due date set")),
            workflow("Change Request Form", "request", "Document requested change, reason, affected items, risk, and approvals.", ("Affected docs listed", "Risk reviewed", "Approvers listed", "Effective date")),
            workflow("Audit Checklist Form", "inspection", "Record audit area, evidence, finding level, responsible owner, and closure target.", ("Evidence reviewed", "Finding level", "Owner assigned", "Closure date")),
            workflow("Training Sign-Off Form", "people", "Track employees trained, instruction version, trainer, date, and competency notes.", ("Version listed", "Trainer signed", "Questions answered", "Competency checked")),
        ),
        common_checklist=("Hold product", "Notify quality", "Update record", "Verify closure"),
    ),
    SectionSpec(
        key="logistics_transport",
        prefix="DLT",
        start_number=1500,
        count=63,
        label="Logistics & Transportation",
        subtitle="Original blank templates for delivery, dispatch, inventory, warehouse, fleet, freight, route, and cold-chain documentation.",
        party_label="Driver / dispatcher / warehouse contact",
        subject_label="Shipment / vehicle / order",
        contexts=("Local Delivery", "Courier", "Freight", "Warehouse Pick", "Inventory Count", "Return Merchandise", "Fleet Fuel", "Trailer", "Cold Chain", "Yard Check", "Route Sheet", "Last Mile", "Pallet Count", "Cross-Dock", "Expedited Shipment"),
        workflows=(
            workflow("Delivery Receipt Form", "task", "Record delivery details, recipient, condition, exceptions, and signature.", ("Recipient verified", "Condition checked", "Exception noted", "Signature captured")),
            workflow("Proof of Delivery Form", "task", "Capture delivery completion, time, location, received-by details, and notes.", ("Time recorded", "Location confirmed", "Photo needed", "Recipient signed")),
            workflow("Inspection Checklist Form", "inspection", "Inspect vehicle, trailer, load condition, seals, temperature, or safety items.", ("Vehicle checked", "Load secure", "Seal checked", "Temperature recorded")),
            workflow("Dispatch Sheet Form", "log", "Track route assignment, stops, driver notes, timing, and exceptions.", ("Driver assigned", "Stops listed", "ETA reviewed", "Exception plan")),
            workflow("Freight Claim Intake Form", "request", "Describe loss or damage, shipment details, item value, evidence, and next action.", ("Photos attached", "Value listed", "Carrier notified", "Documents needed")),
            workflow("Inventory Adjustment Form", "finance", "Record count variance, item details, reason, approval, and reconciliation notes.", ("Variance counted", "Reason selected", "Supervisor review", "System updated")),
            workflow("Temperature Log Form", "log", "Track temperature readings, equipment status, excursions, and corrective action.", ("Reading recorded", "Excursion noted", "Product held", "Manager notified")),
        ),
        common_checklist=("Attach bill / receipt", "Notify customer", "Update system", "Follow-up required"),
    ),
    SectionSpec(
        key="education_childcare",
        prefix="DEC",
        start_number=1600,
        count=63,
        label="Education & Childcare",
        subtitle="Original blank templates for schools, camps, tutoring, childcare, permission, medical authorization, attendance, and parent communication.",
        party_label="Parent / guardian / student",
        subject_label="Student / program",
        contexts=("Field Trip", "Childcare Registration", "Summer Camp", "After School Program", "Tutoring", "Student Emergency Contact", "Medication Authorization", "Allergy Action Plan", "Volunteer Chaperone", "Photo Release", "Device Checkout", "Attendance Correction", "Behavior Incident", "Sports Clearance", "Club Registration"),
        workflows=(
            workflow("Permission Slip Form", "people", "Capture permission details, emergency contacts, medical notes, transportation, and guardian signature.", ("Guardian contact", "Emergency contact", "Medical notes", "Signature needed")),
            workflow("Registration Form", "people", "Collect participant details, schedule preferences, contacts, fees, and consent notes.", ("Contact complete", "Schedule selected", "Fee reviewed", "Consent signed")),
            workflow("Medical Authorization Form", "request", "Document medication, dosage, restrictions, authorized staff, and emergency instructions.", ("Dose listed", "Provider note", "Storage instructions", "Parent signed")),
            workflow("Incident Report Form", "inspection", "Record incident details, witnesses, response, parent notification, and follow-up.", ("Parent notified", "Witness noted", "Action taken", "Follow-up set")),
            workflow("Sign-In Sheet Form", "people", "Track arrival, dismissal, authorized pickup, staff initials, and notes.", ("Authorized pickup", "Time recorded", "Staff initials", "Late pickup")),
            workflow("Equipment Checkout Form", "log", "Record device or equipment issue, condition, serial number, return date, and acknowledgment.", ("Serial recorded", "Condition noted", "Return date", "Agreement signed")),
            workflow("Meeting Notes Form", "log", "Capture meeting attendees, goals, action items, supports, and next review date.", ("Attendees listed", "Goals reviewed", "Actions assigned", "Next date")),
        ),
        common_checklist=("Parent copy needed", "Update student file", "Staff review", "Follow-up required"),
    ),
    SectionSpec(
        key="nonprofit_events",
        prefix="DNE",
        start_number=1700,
        count=63,
        label="Nonprofit & Events",
        subtitle="Original blank templates for volunteer coordination, donations, sponsorships, events, program intake, memberships, and community services.",
        party_label="Donor / volunteer / participant",
        subject_label="Program / event",
        contexts=("Volunteer Application", "Donation Pledge", "In-Kind Donation", "Event Sponsorship", "Grant Intake", "Program Enrollment", "Client Assistance", "Food Pantry", "Volunteer Hours", "Board Disclosure", "Fundraiser Order", "Silent Auction", "Membership Renewal", "Media Release", "Community Workshop"),
        workflows=(
            workflow("Signup Form", "people", "Collect participant details, availability, role preferences, consent, and follow-up notes.", ("Availability listed", "Role selected", "Consent reviewed", "Follow-up needed")),
            workflow("Pledge Form", "finance", "Record pledge amount, schedule, donor details, restrictions, and acknowledgment preferences.", ("Amount listed", "Payment schedule", "Receipt preference", "Restriction noted")),
            workflow("Intake Form", "request", "Capture request details, eligibility notes, documents, urgency, and staff assignment.", ("Eligibility reviewed", "Documents requested", "Staff assigned", "Urgency set")),
            workflow("Event Registration Form", "people", "Record attendee details, ticket type, accessibility needs, waiver, and payment notes.", ("Ticket type", "Accessibility needs", "Waiver signed", "Payment status")),
            workflow("Donation Receipt Worksheet Form", "finance", "Document donation details, fair-market notes, restrictions, and receipt workflow.", ("Description complete", "Value note", "Restriction checked", "Receipt sent")),
            workflow("Incident Report Form", "inspection", "Record event or program incident, response, witnesses, and follow-up owner.", ("Area secured", "Witness noted", "Manager notified", "Follow-up owner")),
            workflow("Volunteer Hours Log Form", "log", "Track volunteer date, hours, activity, supervisor, and verification.", ("Hours totaled", "Supervisor signed", "Activity noted", "Entered in CRM")),
        ),
        common_checklist=("Send confirmation", "Update CRM", "Needs staff review", "Receipt required"),
    ),
    SectionSpec(
        key="hr_operations",
        prefix="DHR",
        start_number=1800,
        count=62,
        label="HR Operations",
        subtitle="Original blank templates for employee requests, onboarding, equipment, training, time off, expenses, performance, and workplace records.",
        party_label="Employee / candidate",
        subject_label="Department / role",
        contexts=("Candidate Interview", "Employee Equipment", "Time Off", "Shift Swap", "Expense Reimbursement", "Training Attendance", "Safety Incident", "Performance Improvement", "Remote Work", "Exit Interview", "Contractor Onboarding", "Policy Acknowledgment", "Uniform Request", "Payroll Change", "Employee Referral"),
        workflows=(
            workflow("Request Form", "request", "Describe the request, business reason, dates, manager notes, and approval path.", ("Manager review", "Policy checked", "Date confirmed", "Approval needed")),
            workflow("Acknowledgment Form", "people", "Record policy or equipment acknowledgment, version, employee signature, and notes.", ("Version listed", "Employee signed", "Manager signed", "Copy saved")),
            workflow("Evaluation Form", "people", "Capture evaluation criteria, feedback, rating, concerns, and next steps.", ("Criteria reviewed", "Notes complete", "Decision needed", "Follow-up set")),
            workflow("Incident Report Form", "inspection", "Document workplace incident, response, witnesses, injury notes, and corrective action.", ("Manager notified", "Witness listed", "Corrective action", "HR review")),
            workflow("Checklist Form", "inspection", "Track required items, completion status, owner, and exceptions.", ("Item complete", "Exception noted", "Owner assigned", "Due date")),
            workflow("Log Form", "log", "Track repeated employee entries, status, dates, and follow-up notes.", ("Date logged", "Status updated", "Manager note", "Follow-up")),
            workflow("Approval Form", "finance", "Record amount or change requested, effective date, supporting details, and approvals.", ("Amount checked", "Effective date", "Budget review", "Final approval")),
        ),
        common_checklist=("Save to personnel file", "Notify payroll", "Notify manager", "Employee copy needed"),
    ),
    SectionSpec(
        key="finance_lending",
        prefix="DFL",
        start_number=1900,
        count=62,
        label="Finance & Lending",
        subtitle="Original blank templates for borrower intake, account changes, document checklists, payment plans, KYC review, and loan-office workflows.",
        party_label="Applicant / customer",
        subject_label="Account / loan / request",
        contexts=("Personal Loan", "Auto Loan", "Mortgage Prequalification", "Small Business Loan", "Borrower Document", "Credit Authorization", "Payment Plan", "Bank Account Change", "Wire Transfer", "KYC Customer", "Beneficial Ownership", "Collections Call", "Loan Modification", "Deposit Verification", "Fraud Review"),
        workflows=(
            workflow("Intake Form", "finance", "Collect applicant details, requested amount, purpose, documents, and follow-up.", ("Identity checked", "Amount listed", "Documents needed", "Follow-up set")),
            workflow("Document Checklist Form", "inspection", "Track received documents, missing items, review status, and expiration dates.", ("Received", "Missing item", "Review needed", "Expiration date")),
            workflow("Authorization Form", "request", "Record authorization scope, account details, effective date, and signature.", ("Scope listed", "Identity verified", "Effective date", "Signature needed")),
            workflow("Status Update Form", "log", "Track application or account status, owner, blockers, and next action.", ("Status updated", "Owner assigned", "Blocker noted", "Next action")),
            workflow("Payment Worksheet Form", "finance", "Record payment amount, schedule, source, exceptions, and approval notes.", ("Amount confirmed", "Schedule set", "Source noted", "Approval needed")),
            workflow("Risk Review Form", "inspection", "Document red flags, supporting evidence, reviewer notes, and escalation.", ("Red flag noted", "Evidence attached", "Escalation needed", "Reviewer signed")),
            workflow("Customer Change Request Form", "request", "Capture requested account or contact change, verification details, and approval.", ("Verification complete", "Change described", "Effective date", "Confirmation sent")),
        ),
        common_checklist=("Do not include sensitive IDs unless required", "Manager review", "Update system", "Send confirmation"),
    ),
    SectionSpec(
        key="insurance_claims",
        prefix="DIC",
        start_number=2000,
        count=62,
        label="Insurance Claims",
        subtitle="Original blank templates for claim intake, property inventory, inspection, certificate requests, policy changes, evidence tracking, and status updates.",
        party_label="Policyholder / claimant",
        subject_label="Policy / claim / incident",
        contexts=("Auto Accident", "Property Damage", "Water Damage", "Roof Damage", "Liability Incident", "Workers Comp", "Claim Status", "Policy Change", "Certificate Request", "Evidence Upload", "Subrogation Contact", "Contents Inventory", "Vendor Estimate", "Loss Inspection", "Coverage Question"),
        workflows=(
            workflow("Claim Intake Form", "request", "Describe the loss, date, location, parties involved, damages, and immediate needs.", ("Loss date", "Photos attached", "Police / report?", "Urgent need")),
            workflow("Inspection Report Form", "inspection", "Record inspection findings, damage areas, measurements, evidence, and recommendations.", ("Damage mapped", "Photos taken", "Measurements", "Estimate needed")),
            workflow("Inventory Worksheet Form", "finance", "List damaged or lost items, age, value, documentation, and replacement notes.", ("Item listed", "Receipt available", "Photo attached", "Replacement cost")),
            workflow("Status Update Form", "log", "Track claim milestones, pending documents, communication, and next action.", ("Milestone updated", "Document missing", "Contact logged", "Next action")),
            workflow("Policy Change Request Form", "request", "Capture requested coverage or contact changes, effective date, and approval notes.", ("Change described", "Effective date", "Premium impact", "Signature needed")),
            workflow("Evidence Checklist Form", "inspection", "Track photos, invoices, reports, estimates, statements, and upload status.", ("Photos", "Invoices", "Reports", "Statements")),
            workflow("Contact Log Form", "log", "Record claim calls, adjuster notes, promises, due dates, and unresolved items.", ("Call logged", "Due date", "Open question", "Escalation needed")),
        ),
        common_checklist=("Send to adjuster", "Request missing document", "Update claim file", "Follow-up required"),
    ),
    SectionSpec(
        key="legal_office",
        prefix="DLO",
        start_number=2100,
        count=62,
        label="Legal Office",
        subtitle="Original blank templates for law-office intake, conflict checks, matter opening, document requests, filing checklists, and administrative tracking.",
        party_label="Client / contact",
        subject_label="Matter / case type",
        contexts=("Client Intake", "Conflict Check", "Matter Opening", "Document Request", "Consultation Notes", "Deposition Prep", "Discovery Tracker", "Court Filing", "Estate Planning Intake", "Family Law Intake", "Immigration Consultation", "Demand Letter Intake", "Notary Log", "Billing Authorization", "Retainer Follow-Up"),
        workflows=(
            workflow("Intake Form", "people", "Capture contact details, matter summary, deadlines, parties, and requested service.", ("Parties listed", "Deadline noted", "Documents requested", "Conflict check")),
            workflow("Checklist Form", "inspection", "Track required steps, documents, responsible owner, deadline, and completion status.", ("Deadline set", "Owner assigned", "Document received", "Ready for review")),
            workflow("Notes Form", "log", "Record meeting notes, facts, questions, documents, and next actions.", ("Facts noted", "Questions listed", "Next action", "Follow-up date")),
            workflow("Document Request Form", "request", "List requested documents, source, due date, delivery method, and status.", ("Document named", "Source listed", "Due date", "Received")),
            workflow("Authorization Form", "request", "Record administrative authorization details, scope, signature, and staff review.", ("Scope described", "Client signed", "Staff reviewed", "Copy saved")),
            workflow("Status Log Form", "log", "Track matter status, filing updates, communication, and open tasks.", ("Status updated", "Task assigned", "Filing note", "Client update")),
            workflow("Review Form", "inspection", "Document review issues, missing facts, risk notes, and senior review.", ("Missing fact", "Risk note", "Senior review", "Client follow-up")),
        ),
        common_checklist=("Not legal advice template", "Attorney review", "Update matter file", "Client copy needed"),
    ),
    SectionSpec(
        key="hospitality_events",
        prefix="DHE",
        start_number=2200,
        count=62,
        label="Hospitality & Events",
        subtitle="Original blank templates for venues, catering, lodging, event operations, guest incidents, banquet orders, vendor load-in, and staff coordination.",
        party_label="Guest / client / event contact",
        subject_label="Event / room / booking",
        contexts=("Event Inquiry", "Banquet Order", "Catering Order", "Room Block", "Guest Incident", "Lost and Found", "Vendor Load-In", "Wedding Planning", "Bar Service", "Housekeeping", "Maintenance Request", "Rental Equipment", "Event Staff", "Group Check-In", "Venue Walkthrough"),
        workflows=(
            workflow("Request Form", "request", "Describe event or guest request, date, headcount, room needs, and service expectations.", ("Date listed", "Headcount", "Room needs", "Deposit question")),
            workflow("Order Form", "finance", "Record order items, quantities, pricing, service timing, and approvals.", ("Items listed", "Quantity checked", "Price reviewed", "Approval needed")),
            workflow("Checklist Form", "inspection", "Track setup tasks, room condition, supplies, staffing, and closeout.", ("Setup complete", "Supplies checked", "Staff assigned", "Closeout")),
            workflow("Incident Report Form", "inspection", "Record guest or event incident, response, witnesses, and manager follow-up.", ("Manager notified", "Witness noted", "Guest contacted", "Follow-up")),
            workflow("Inventory Log Form", "log", "Track stock, equipment, rentals, shortages, damage, and returns.", ("Count complete", "Shortage noted", "Damage noted", "Return due")),
            workflow("Sign-In Sheet Form", "people", "Track arrivals, roles, credentials, timing, and contact details.", ("Arrival time", "Role listed", "Badge issued", "Checkout")),
            workflow("Post-Event Review Form", "log", "Summarize event outcome, client feedback, issues, and improvement items.", ("Feedback captured", "Issue logged", "Invoice note", "Next booking")),
        ),
        common_checklist=("Notify coordinator", "Update booking", "Send confirmation", "Manager review"),
    ),
    SectionSpec(
        key="agriculture_food",
        prefix="DAF",
        start_number=2300,
        count=62,
        label="Agriculture & Food",
        subtitle="Original blank templates for farm operations, food safety, equipment, livestock, produce traceability, markets, and temperature logs.",
        party_label="Grower / handler / operator",
        subject_label="Field / lot / product",
        contexts=("Farm Equipment", "Pesticide Application", "Crop Scouting", "Irrigation", "Livestock Treatment", "Harvest Load", "Produce Traceability", "Food Safety", "Cooler Temperature", "Farmers Market Vendor", "CSA Subscription", "Seed Inventory", "Feed Delivery", "Sanitation", "Supplier Receiving"),
        workflows=(
            workflow("Log Form", "log", "Track date, location, product or animal details, readings, and notes.", ("Date recorded", "Lot / animal ID", "Reading logged", "Supervisor review")),
            workflow("Inspection Checklist Form", "inspection", "Record inspection items, condition, corrective actions, and verification.", ("Condition checked", "Issue noted", "Corrective action", "Verified")),
            workflow("Request Form", "request", "Capture requested supply, service, delivery, field, or production action.", ("Need date", "Quantity listed", "Approver", "Vendor")),
            workflow("Traceability Worksheet Form", "log", "Record lot, source, destination, quantity, handler, and chain-of-custody notes.", ("Lot recorded", "Source listed", "Destination", "Quantity")),
            workflow("Maintenance Checklist Form", "inspection", "Track equipment or facility maintenance, parts, service, and next due date.", ("Safety checked", "Parts needed", "Service done", "Next due")),
            workflow("Vendor Form", "people", "Collect vendor details, product, insurance or permit notes, and approval.", ("Contact complete", "Product listed", "Permit note", "Approved")),
            workflow("Incident Report Form", "inspection", "Document food safety, equipment, livestock, or field incident and response.", ("Area secured", "Product held", "Manager notified", "Follow-up")),
        ),
        common_checklist=("Keep with lot record", "Manager review", "Corrective action", "Follow-up required"),
    ),
    SectionSpec(
        key="utilities_energy",
        prefix="DUE",
        start_number=2400,
        count=62,
        label="Utilities & Energy",
        subtitle="Original blank templates for solar, EV charging, energy audits, service requests, meters, outages, water, generators, and inspections.",
        party_label="Customer / technician",
        subject_label="Service address / asset",
        contexts=("Solar Site Survey", "EV Charger Installation", "Energy Audit", "Utility Service", "Meter Reading", "Outage Report", "Generator", "Battery Storage", "Water Leak", "Backflow Test", "Wastewater Work Order", "Propane Delivery", "Weatherization", "Pole Line", "Load Calculation"),
        workflows=(
            workflow("Intake Form", "request", "Capture site details, service need, access, equipment, and target timeline.", ("Site address", "Access noted", "Equipment listed", "Timeline")),
            workflow("Inspection Checklist Form", "inspection", "Record inspection items, safety issues, readings, and corrective actions.", ("Safety checked", "Reading recorded", "Issue noted", "Action needed")),
            workflow("Work Order Form", "task", "Document assigned work, materials, crew, outage considerations, and closeout.", ("Crew assigned", "Materials listed", "Customer notified", "Closeout")),
            workflow("Reading Log Form", "log", "Track readings, date/time, equipment status, variance, and notes.", ("Reading entered", "Variance checked", "Equipment status", "Follow-up")),
            workflow("Customer Request Form", "request", "Describe customer request, account details, urgency, and approval notes.", ("Account found", "Urgency set", "Approval", "Confirmation")),
            workflow("Maintenance Log Form", "log", "Track maintenance activity, parts, readings, test results, and next due date.", ("Parts logged", "Test complete", "Next due", "Supervisor review")),
            workflow("Incident Report Form", "inspection", "Record outage, leak, equipment, or safety incident and response steps.", ("Area secured", "Customer notified", "Crew dispatched", "Manager review")),
        ),
        common_checklist=("Safety review", "Notify customer", "Update asset record", "Schedule follow-up"),
    ),
    SectionSpec(
        key="retail_operations",
        prefix="DRO",
        start_number=2500,
        count=62,
        label="Retail Operations",
        subtitle="Original blank templates for store operations, opening/closing, inventory, cash handling, returns, vendor receiving, audits, and incidents.",
        party_label="Associate / customer / vendor",
        subject_label="Store / transaction / item",
        contexts=("Store Opening", "Store Closing", "Cash Drawer", "Inventory Adjustment", "Customer Return", "Vendor Intake", "Visual Merchandising", "Food Temperature", "Loss Prevention", "Donation Request", "Special Order", "Delivery Receiving", "Mystery Shop", "Staff Training", "Price Override"),
        workflows=(
            workflow("Checklist Form", "inspection", "Track required store tasks, exceptions, owner, and completion notes.", ("Task complete", "Exception noted", "Owner assigned", "Manager review")),
            workflow("Count Sheet Form", "finance", "Record counts, variance, reason, approval, and reconciliation notes.", ("Count complete", "Variance noted", "Reason listed", "Approved")),
            workflow("Request Form", "request", "Capture request details, item information, customer or vendor notes, and approval path.", ("Details complete", "Approval needed", "Customer notified", "Due date")),
            workflow("Incident Report Form", "inspection", "Document incident details, people involved, response, evidence, and follow-up.", ("Manager notified", "Evidence attached", "Witness noted", "Follow-up")),
            workflow("Audit Form", "inspection", "Record audit criteria, finding, score, owner, and corrective action.", ("Finding recorded", "Score listed", "Owner assigned", "Action due")),
            workflow("Log Form", "log", "Track repeated entries, status, dates, initials, and notes.", ("Date logged", "Status updated", "Initials", "Exception")),
            workflow("Training Sign-Off Form", "people", "Track trainee, topic, trainer, date, and competency notes.", ("Topic listed", "Trainer signed", "Trainee signed", "Manager review")),
        ),
        common_checklist=("Update POS / system", "Customer follow-up", "Save store copy", "Manager approval"),
    ),
)


def build_entries(section: SectionSpec) -> list[tuple[dict, WorkflowSpec, str]]:
    entries: list[tuple[dict, WorkflowSpec, str]] = []
    seen_titles: set[str] = set()
    number = section.start_number
    for context in section.contexts:
        for spec in section.workflows:
            if len(entries) >= section.count:
                return entries
            title = build_title(context, spec.suffix)
            if title in seen_titles:
                continue
            seen_titles.add(title)
            form_number = f"{section.prefix} {number}"
            entries.append((metadata_entry(section.key, form_number, title), spec, context))
            number += 1
    if len(entries) != section.count:
        raise RuntimeError(f"{section.key} generated {len(entries)} entries, expected {section.count}")
    return entries


def load_metadata() -> dict:
    if not METADATA_PATH.exists():
        return {}
    return json.loads(METADATA_PATH.read_text())


def save_metadata(metadata: dict) -> None:
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(json.dumps(metadata, indent=2) + "\n")


def configure_paths(catalog_root: str) -> None:
    global CATALOG_ROOT, METADATA_PATH
    CATALOG_ROOT = Path(catalog_root).resolve()
    METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"


def main() -> int:
    args = parse_args()
    configure_paths(args.catalog_root)
    CATALOG_ROOT.mkdir(parents=True, exist_ok=True)
    metadata = load_metadata()
    generated_total = 0

    for section in SECTIONS:
        generated = build_entries(section)
        generated_entries = [entry for entry, _workflow, _context in generated]
        generated_filenames = {entry["filename"] for entry in generated_entries}
        generated_form_numbers = {entry["form_number"] for entry in generated_entries}
        existing_entries = [
            entry
            for entry in metadata.get(section.key, [])
            if (
                entry.get("filename") not in generated_filenames
                and entry.get("form_number") not in generated_form_numbers
            )
        ]
        metadata[section.key] = existing_entries + generated_entries
        if not args.metadata_only:
            cleanup_stale_managed_files(section, generated_entries)
            for entry, spec, context in generated:
                render_pdf(section, entry, spec, context)
        generated_total += len(generated)

    # Keep this generator idempotent for its own form-number ranges while
    # preserving unrelated generated sections owned by other catalog passes.
    save_metadata(dict(sorted(metadata.items())))
    action = "registered" if args.metadata_only else "generated"
    noun = "metadata entries" if args.metadata_only else "PDFs"
    print(f"[generate-form-catalog-longtail-templates] {action} {generated_total} {noun} across {len(SECTIONS)} sections")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
