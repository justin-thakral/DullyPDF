#!/usr/bin/env python3
"""Generate first-party long-tail catalog templates.

The catalog already mirrors official public-domain forms where hosting is safe.
This generator fills search-heavy gaps where the available PDFs are usually
copyrighted, vendor-branded, or too fragmented to mirror. Every output file is a
DullyPDF-authored blank AcroForm template. Runtime is O(n * f), where n is the
number of templates and f is the fixed number of fields/widgets rendered per
template.
"""

from __future__ import annotations

import json
import re
import argparse
from dataclasses import dataclass
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph

REPO_ROOT = Path(__file__).resolve().parents[1]
CATALOG_ROOT = REPO_ROOT / "form_catalog"
METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"
PAGE_WIDTH, PAGE_HEIGHT = letter


@dataclass(frozen=True)
class SectionSpec:
    section: str
    prefix: str
    start_number: int
    label: str
    count: int
    focuses: tuple[str, ...]
    workflows: tuple[str, ...]
    requester_label: str
    subject_label: str
    location_label: str
    checklist_options: tuple[str, ...]
    status_options: tuple[str, ...]
    table_columns: tuple[str, ...]


SECTIONS: tuple[SectionSpec, ...] = (
    SectionSpec(
        section="real_estate_property",
        prefix="DPM",
        start_number=1000,
        label="Real Estate & Property",
        count=80,
        focuses=(
            "Apartment Maintenance",
            "Rental Home Repair",
            "Condo Association",
            "HOA Violation",
            "Lease Renewal",
            "Move-In Inspection",
            "Move-Out Inspection",
            "Security Deposit",
            "Tenant Complaint",
            "Pet Addendum",
            "Parking Permit",
            "Roommate Change",
            "Short-Term Rental",
            "Commercial Suite",
            "Storage Unit",
            "Landlord Entry",
        ),
        workflows=(
            "Request Form",
            "Intake Form",
            "Inspection Checklist",
            "Approval Form",
            "Tracking Log",
        ),
        requester_label="Tenant / owner / requester",
        subject_label="Property, unit, or lease topic",
        location_label="Property address / unit",
        checklist_options=(
            "Needs maintenance",
            "Needs tenant follow-up",
            "Needs owner approval",
            "Photos attached",
            "Vendor scheduled",
            "Lease file updated",
        ),
        status_options=("New", "Scheduled", "Waiting on approval", "Completed", "Closed"),
        table_columns=("Item / room / issue", "Priority", "Owner", "Due date", "Notes"),
    ),
    SectionSpec(
        section="construction_trades",
        prefix="DCT",
        start_number=1100,
        label="Construction & Trades",
        count=75,
        focuses=(
            "Roofing Repair",
            "Electrical Service",
            "Plumbing Service",
            "HVAC Installation",
            "Drywall Repair",
            "Painting Project",
            "Flooring Installation",
            "Concrete Pour",
            "Remodel Scope",
            "Change Order",
            "Subcontractor Work Order",
            "Jobsite Safety",
            "Punch List",
            "Material Delivery",
            "Warranty Repair",
        ),
        workflows=(
            "Estimate Request Form",
            "Work Order Form",
            "Inspection Checklist",
            "Completion Sign-Off Form",
            "Issue Tracking Log",
        ),
        requester_label="Customer / contractor contact",
        subject_label="Project scope or trade issue",
        location_label="Jobsite address",
        checklist_options=(
            "Permit required",
            "Customer approval needed",
            "Materials ordered",
            "Crew assigned",
            "Photos attached",
            "Final walkthrough needed",
        ),
        status_options=("Bid", "Approved", "In progress", "Blocked", "Complete"),
        table_columns=("Task / material / room", "Quantity", "Responsible party", "Target date", "Notes"),
    ),
    SectionSpec(
        section="field_service",
        prefix="DFM",
        start_number=1200,
        label="Field Service",
        count=75,
        focuses=(
            "HVAC Preventive Maintenance",
            "Elevator Service",
            "Fire Alarm Inspection",
            "Generator Maintenance",
            "Commercial Kitchen Equipment",
            "Refrigeration Service",
            "Boiler Inspection",
            "Pest Control Service",
            "Landscaping Visit",
            "Pool Maintenance",
            "Janitorial Walkthrough",
            "IT Help Desk",
            "Copier Service",
            "Security System Service",
            "Appliance Repair",
        ),
        workflows=(
            "Service Request Form",
            "Work Order Form",
            "Inspection Checklist",
            "Technician Sign-Off Form",
            "Maintenance Log",
        ),
        requester_label="Customer / site contact",
        subject_label="Asset, equipment, or service issue",
        location_label="Service location",
        checklist_options=(
            "Warranty may apply",
            "Parts needed",
            "Follow-up visit needed",
            "Safety issue",
            "Customer present",
            "Invoice review needed",
        ),
        status_options=("Open", "Dispatched", "Waiting on parts", "Resolved", "Billed"),
        table_columns=("Asset / service step", "Reading / result", "Technician", "Time", "Notes"),
    ),
    SectionSpec(
        section="safety_compliance",
        prefix="DSC",
        start_number=1300,
        label="Safety & Compliance",
        count=65,
        focuses=(
            "Workplace Incident",
            "Near Miss",
            "Hazard Correction",
            "PPE Compliance",
            "Fire Extinguisher",
            "Ladder Safety",
            "Forklift Inspection",
            "Lockout Tagout",
            "Chemical Spill",
            "First Aid Kit",
            "Safety Training",
            "Visitor Safety",
            "Ergonomic Assessment",
        ),
        workflows=(
            "Report Form",
            "Inspection Checklist",
            "Corrective Action Form",
            "Training Attendance Log",
            "Follow-Up Worksheet",
        ),
        requester_label="Reporter / safety lead",
        subject_label="Incident, hazard, or compliance topic",
        location_label="Department / site",
        checklist_options=(
            "Immediate hazard controlled",
            "Supervisor notified",
            "Photos attached",
            "Training required",
            "Regulatory review needed",
            "Corrective action assigned",
        ),
        status_options=("Reported", "Investigating", "Corrective action", "Verified", "Closed"),
        table_columns=("Hazard / action", "Risk level", "Owner", "Due date", "Verification notes"),
    ),
    SectionSpec(
        section="education_childcare",
        prefix="DEC",
        start_number=1400,
        label="Education & Childcare",
        count=70,
        focuses=(
            "Field Trip Permission",
            "Student Medication",
            "After-School Enrollment",
            "Childcare Incident",
            "Preschool Registration",
            "Tutoring Intake",
            "IEP Meeting Prep",
            "Classroom Volunteer",
            "Summer Camp Registration",
            "Sports Physical Packet",
            "School Transportation",
            "Allergy Action Plan",
            "Parent Conference",
            "Device Checkout",
        ),
        workflows=(
            "Form",
            "Authorization Form",
            "Checklist",
            "Request Form",
            "Tracking Log",
        ),
        requester_label="Parent / guardian / staff contact",
        subject_label="Student, activity, or program topic",
        location_label="School / classroom / program",
        checklist_options=(
            "Parent signature needed",
            "Emergency contact updated",
            "Medication details included",
            "Transportation needed",
            "Accommodation noted",
            "Staff review complete",
        ),
        status_options=("Draft", "Sent home", "Returned", "Approved", "Archived"),
        table_columns=("Student / item / date", "Requirement", "Staff owner", "Due date", "Notes"),
    ),
    SectionSpec(
        section="legal_admin",
        prefix="DLP",
        start_number=1500,
        label="Legal & Admin",
        count=60,
        focuses=(
            "Family Law Client",
            "Estate Planning Client",
            "Landlord Tenant Client",
            "Small Claims Case",
            "Personal Injury Intake",
            "Immigration Consultation",
            "Bankruptcy Consultation",
            "Business Formation Client",
            "Trademark Intake",
            "Mediation Session",
            "Notary Appointment",
            "Document Review",
        ),
        workflows=(
            "Intake Form",
            "Document Checklist",
            "Consultation Worksheet",
            "Case Update Form",
            "Follow-Up Log",
        ),
        requester_label="Client / matter contact",
        subject_label="Matter type or professional-service request",
        location_label="Jurisdiction / office / meeting location",
        checklist_options=(
            "Conflict check needed",
            "Retainer requested",
            "Documents received",
            "Deadline exists",
            "Follow-up scheduled",
            "Signature needed",
        ),
        status_options=("New inquiry", "Consult scheduled", "Documents pending", "Engaged", "Closed"),
        table_columns=("Document / task", "Source", "Owner", "Deadline", "Notes"),
    ),
    SectionSpec(
        section="insurance_claims",
        prefix="DIC",
        start_number=1600,
        label="Insurance & Claims",
        count=55,
        focuses=(
            "Auto Accident Claim",
            "Property Damage Claim",
            "Renters Insurance Claim",
            "Travel Insurance Claim",
            "Dental Insurance Reimbursement",
            "Vision Insurance Reimbursement",
            "Workers Compensation Intake",
            "Home Warranty Claim",
            "Liability Claim",
            "Medical Bill Reimbursement",
            "Prior Authorization",
        ),
        workflows=(
            "Intake Form",
            "Evidence Checklist",
            "Status Update Form",
            "Appeal Worksheet",
            "Payment Tracking Log",
        ),
        requester_label="Claimant / policyholder",
        subject_label="Claim, policy, or reimbursement topic",
        location_label="Loss location / service provider",
        checklist_options=(
            "Policy number included",
            "Receipts attached",
            "Photos attached",
            "Provider statement needed",
            "Appeal deadline noted",
            "Payment follow-up needed",
        ),
        status_options=("Opened", "Submitted", "Needs evidence", "Appealed", "Paid / closed"),
        table_columns=("Expense / evidence / contact", "Amount", "Date", "Status", "Notes"),
    ),
    SectionSpec(
        section="finance_accounting",
        prefix="DFA",
        start_number=1700,
        label="Finance & Accounting",
        count=55,
        focuses=(
            "Bookkeeping Client",
            "Tax Organizer",
            "Expense Reimbursement",
            "Mileage Reimbursement",
            "Accounts Payable Vendor",
            "Accounts Receivable Collection",
            "Budget Review",
            "Loan Application Prep",
            "Grant Expense",
            "Payroll Change",
            "Contractor Payment",
        ),
        workflows=(
            "Intake Form",
            "Checklist",
            "Approval Form",
            "Reconciliation Worksheet",
            "Tracking Log",
        ),
        requester_label="Client / employee / vendor",
        subject_label="Finance or accounting workflow",
        location_label="Department / client entity",
        checklist_options=(
            "Receipts attached",
            "Manager approval needed",
            "GL code assigned",
            "Payment terms reviewed",
            "Tax document needed",
            "Reconciliation pending",
        ),
        status_options=("Received", "Reviewing", "Approved", "Paid", "Reconciled"),
        table_columns=("Line item / account", "Amount", "Category", "Approver", "Notes"),
    ),
    SectionSpec(
        section="business_operations",
        prefix="DBO",
        start_number=1755,
        label="Business Operations",
        count=55,
        focuses=(
            "Client Onboarding",
            "Vendor Setup",
            "Service Quote",
            "Purchase Request",
            "Customer Complaint",
            "Meeting Action Item",
            "Employee Equipment",
            "Office Supply",
            "Policy Acknowledgment",
            "Project Change Request",
            "Internal Approval",
        ),
        workflows=(
            "Intake Form",
            "Checklist",
            "Approval Form",
            "Request Form",
            "Tracking Log",
        ),
        requester_label="Employee / client / vendor contact",
        subject_label="Business operation or administrative request",
        location_label="Department / team / client",
        checklist_options=(
            "Manager review needed",
            "Vendor details complete",
            "Budget approved",
            "Documents attached",
            "Follow-up owner assigned",
            "Record updated",
        ),
        status_options=("Submitted", "Reviewing", "Approved", "In progress", "Closed"),
        table_columns=("Task / request / item", "Owner", "Priority", "Due date", "Notes"),
    ),
    SectionSpec(
        section="manufacturing_quality",
        prefix="DMQ",
        start_number=1810,
        label="Manufacturing & Quality",
        count=55,
        focuses=(
            "Incoming Material Inspection",
            "Production Line Checklist",
            "Nonconformance Report",
            "Corrective Action",
            "Calibration Record",
            "Batch Release",
            "Tooling Change",
            "Machine Setup",
            "Supplier Quality",
            "Finished Goods Inspection",
            "Maintenance Downtime",
        ),
        workflows=(
            "Form",
            "Checklist",
            "Report Form",
            "Approval Form",
            "Tracking Log",
        ),
        requester_label="Operator / quality / production contact",
        subject_label="Part, batch, process, or quality issue",
        location_label="Line / cell / facility",
        checklist_options=(
            "Spec reviewed",
            "Measurement recorded",
            "Hold tag applied",
            "Supervisor notified",
            "Corrective action assigned",
            "Release approved",
        ),
        status_options=("Open", "On hold", "Reviewing", "Approved", "Closed"),
        table_columns=("Part / step / defect", "Lot / serial", "Result", "Owner", "Notes"),
    ),
    SectionSpec(
        section="events_waivers",
        prefix="DEW",
        start_number=1800,
        label="Events, Waivers & Releases",
        count=55,
        focuses=(
            "Youth Sports Waiver",
            "Fitness Class Waiver",
            "Field Trip Waiver",
            "Volunteer Event",
            "Photography Release",
            "Vendor Booth",
            "Sponsorship",
            "Event Registration",
            "Room Rental",
            "Equipment Rental",
            "Tournament Registration",
        ),
        workflows=(
            "Form",
            "Consent Form",
            "Checklist",
            "Registration Form",
            "Sign-In Log",
        ),
        requester_label="Participant / guardian / organizer",
        subject_label="Event, activity, or release topic",
        location_label="Venue / program location",
        checklist_options=(
            "Waiver language reviewed",
            "Emergency contact included",
            "Payment received",
            "Photo release selected",
            "Equipment returned",
            "Staff verification complete",
        ),
        status_options=("Invited", "Registered", "Checked in", "Completed", "Archived"),
        table_columns=("Participant / item", "Role", "Time", "Staff", "Notes"),
    ),
    SectionSpec(
        section="nonprofit_community",
        prefix="DNV",
        start_number=1900,
        label="Nonprofit & Community",
        count=50,
        focuses=(
            "Volunteer Application",
            "Donation Receipt",
            "In-Kind Donation",
            "Board Member Conflict",
            "Grant Intake",
            "Program Enrollment",
            "Client Assistance",
            "Food Pantry Intake",
            "Fundraiser Sponsor",
            "Mentor Match",
        ),
        workflows=(
            "Form",
            "Intake Form",
            "Checklist",
            "Approval Form",
            "Tracking Log",
        ),
        requester_label="Volunteer / donor / client contact",
        subject_label="Program, donation, or volunteer topic",
        location_label="Program site / chapter",
        checklist_options=(
            "Eligibility reviewed",
            "Background check needed",
            "Donation receipt needed",
            "Board approval needed",
            "Follow-up assigned",
            "Outcome recorded",
        ),
        status_options=("New", "Screening", "Approved", "Active", "Closed"),
        table_columns=("Person / item / service", "Program", "Owner", "Date", "Notes"),
    ),
    SectionSpec(
        section="pet_services",
        prefix="DVP",
        start_number=2000,
        label="Pet Services",
        count=60,
        focuses=(
            "New Pet Patient",
            "Veterinary Medical History",
            "Vaccination Record",
            "Pet Surgery Consent",
            "Dental Cleaning Consent",
            "Grooming Intake",
            "Boarding Intake",
            "Dog Daycare Enrollment",
            "Medication Administration",
            "Pet Behavior",
            "End-of-Life Care",
            "Pet Insurance Claim",
        ),
        workflows=(
            "Form",
            "Intake Form",
            "Checklist",
            "Consent Form",
            "Tracking Log",
        ),
        requester_label="Owner / caretaker",
        subject_label="Pet, visit, or care topic",
        location_label="Clinic / boarding / service location",
        checklist_options=(
            "Vaccines reviewed",
            "Medication noted",
            "Allergies noted",
            "Owner consent needed",
            "Estimate reviewed",
            "Follow-up scheduled",
        ),
        status_options=("New", "Reviewed", "In care", "Ready for pickup", "Closed"),
        table_columns=("Pet / medication / service", "Dose / detail", "Staff", "Date", "Notes"),
    ),
    SectionSpec(
        section="automotive_service",
        prefix="DAS",
        start_number=2100,
        label="Automotive Service",
        count=50,
        focuses=(
            "Vehicle Repair",
            "Oil Change",
            "Tire Rotation",
            "Brake Inspection",
            "Collision Repair",
            "Fleet Vehicle",
            "Used Car Inspection",
            "Detail Service",
            "Warranty Claim",
            "Towing Dispatch",
        ),
        workflows=(
            "Work Order Form",
            "Inspection Checklist",
            "Authorization Form",
            "Estimate Worksheet",
            "Tracking Log",
        ),
        requester_label="Customer / fleet contact",
        subject_label="Vehicle or service request",
        location_label="Shop / pickup / service location",
        checklist_options=(
            "Customer authorization needed",
            "Parts ordered",
            "Diagnostic complete",
            "Warranty reviewed",
            "Photos attached",
            "Ready for pickup",
        ),
        status_options=("Checked in", "Diagnosing", "Waiting on parts", "Repairing", "Complete"),
        table_columns=("Service / part", "Quantity", "Technician", "Status", "Notes"),
    ),
    SectionSpec(
        section="logistics_transport",
        prefix="DLD",
        start_number=2200,
        label="Logistics & Transportation",
        count=50,
        focuses=(
            "Delivery Receipt",
            "Bill of Lading Prep",
            "Courier Pickup",
            "Freight Damage",
            "Return Merchandise",
            "Warehouse Transfer",
            "Driver Daily Route",
            "Proof of Delivery",
            "Equipment Handoff",
            "Shipment Exception",
        ),
        workflows=(
            "Form",
            "Checklist",
            "Authorization Form",
            "Report Form",
            "Tracking Log",
        ),
        requester_label="Shipper / receiver / driver",
        subject_label="Shipment, route, or delivery topic",
        location_label="Origin / destination",
        checklist_options=(
            "Signature required",
            "Damage noted",
            "Photos attached",
            "Temperature check needed",
            "Return label included",
            "Exception escalated",
        ),
        status_options=("Planned", "Picked up", "In transit", "Exception", "Delivered"),
        table_columns=("Package / stop / item", "Quantity", "Time", "Status", "Notes"),
    ),
    SectionSpec(
        section="beauty_wellness",
        prefix="DBW",
        start_number=2300,
        label="Beauty & Wellness",
        count=45,
        focuses=(
            "Salon New Client",
            "Hair Color Consultation",
            "Lash Extension Consent",
            "Skin Care Intake",
            "Massage Therapy Intake",
            "Tattoo Consent",
            "Piercing Consent",
            "Personal Training Intake",
            "Nutrition Coaching",
        ),
        workflows=(
            "Form",
            "Intake Form",
            "Consent Form",
            "Follow-Up Worksheet",
            "Treatment Tracking Log",
        ),
        requester_label="Client / guardian",
        subject_label="Service, treatment, or wellness goal",
        location_label="Studio / clinic / appointment location",
        checklist_options=(
            "Contraindications reviewed",
            "Patch test needed",
            "Aftercare provided",
            "Photo consent selected",
            "Follow-up booked",
            "Payment reviewed",
        ),
        status_options=("Booked", "Checked in", "In service", "Aftercare", "Complete"),
        table_columns=("Service / product / goal", "Detail", "Provider", "Date", "Notes"),
    ),
    SectionSpec(
        section="home_services",
        prefix="DHS",
        start_number=2400,
        label="Home Services",
        count=45,
        focuses=(
            "House Cleaning",
            "Lawn Care",
            "Handyman Repair",
            "Plumbing Call",
            "Electrical Call",
            "Moving Estimate",
            "Home Inspection",
            "Window Cleaning",
            "Appliance Installation",
        ),
        workflows=(
            "Request Form",
            "Estimate Worksheet",
            "Work Order Form",
            "Inspection Checklist",
            "Completion Sign-Off Form",
        ),
        requester_label="Homeowner / renter / property contact",
        subject_label="Home service request",
        location_label="Service address",
        checklist_options=(
            "Access instructions provided",
            "Estimate approved",
            "Materials needed",
            "Before photos attached",
            "After photos attached",
            "Customer sign-off needed",
        ),
        status_options=("Requested", "Estimated", "Scheduled", "Completed", "Invoiced"),
        table_columns=("Room / task / item", "Quantity", "Worker", "Status", "Notes"),
    ),
)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_")


def filename_for(form_number: str, title: str) -> str:
    return f"{slugify(form_number)}__{slugify(title)}.pdf"


def title_for(focus: str, workflow: str) -> str:
    if workflow == "Form" and focus.endswith(("Form", "Waiver", "Release")):
        return focus
    return f"{focus} {workflow}"


def build_titles(spec: SectionSpec) -> list[str]:
    titles: list[str] = []
    for focus in spec.focuses:
        for workflow in spec.workflows:
            titles.append(title_for(focus, workflow))
    if len(titles) < spec.count:
        raise RuntimeError(f"{spec.section} only generated {len(titles)} titles")
    return titles[: spec.count]


class TemplateBuilder:
    def __init__(self, c: canvas.Canvas, form_number: str, title: str, subtitle: str):
        self.canvas = c
        self.form_number = form_number
        self.title = title
        self.subtitle = subtitle
        self.margin_x = 0.62 * inch
        self.top_margin = PAGE_HEIGHT - 0.68 * inch
        self.bottom_margin = 0.65 * inch
        self.content_width = PAGE_WIDTH - (self.margin_x * 2)
        self.y = self.top_margin
        self.page_number = 0
        self.field_counter = 0
        self.prefix = slugify(form_number)
        self.styles = self._styles()
        self.new_page()

    def _styles(self) -> dict[str, ParagraphStyle]:
        base = getSampleStyleSheet()
        return {
            "title": ParagraphStyle(
                "GeneratedCatalogTitle",
                parent=base["Heading1"],
                fontName="Helvetica-Bold",
                fontSize=17,
                leading=20,
                textColor=colors.HexColor("#111827"),
            ),
            "body": ParagraphStyle(
                "GeneratedCatalogBody",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=8.5,
                leading=10.5,
                textColor=colors.HexColor("#374151"),
            ),
            "small": ParagraphStyle(
                "GeneratedCatalogSmall",
                parent=base["BodyText"],
                fontName="Helvetica",
                fontSize=7.5,
                leading=9,
                textColor=colors.HexColor("#6B7280"),
            ),
        }

    def field_name(self, key: str) -> str:
        self.field_counter += 1
        return f"{self.prefix}_{slugify(key)}_{self.field_counter}"

    def paragraph(self, text: str, style_name: str, x: float, top_y: float, width: float) -> float:
        para = Paragraph(text, self.styles[style_name])
        _, height = para.wrap(width, PAGE_HEIGHT)
        para.drawOn(self.canvas, x, top_y - height)
        return height

    def new_page(self) -> None:
        if self.page_number:
            self.canvas.showPage()
        self.page_number += 1
        self.y = self.top_margin
        self.canvas.setFillColor(colors.HexColor("#EEF2FF"))
        self.canvas.roundRect(self.margin_x, self.y - 0.46 * inch, self.content_width, 0.52 * inch, 8, stroke=0, fill=1)
        header_title = self.title if self.page_number == 1 else f"{self.title} - Page {self.page_number}"
        self.paragraph(header_title, "title", self.margin_x + 10, self.y - 6, self.content_width - 1.25 * inch)
        self.canvas.setFillColor(colors.HexColor("#111827"))
        self.canvas.setFont("Helvetica-Bold", 9)
        self.canvas.drawRightString(PAGE_WIDTH - self.margin_x - 10, self.y - 18, self.form_number)
        used = self.paragraph(self.subtitle, "body", self.margin_x, self.y - 0.58 * inch, self.content_width)
        self.y -= 0.65 * inch + used + 12

    def ensure_space(self, height: float) -> None:
        if self.y - height < self.bottom_margin:
            self.new_page()

    def section(self, title: str, helper: str | None = None) -> None:
        helper_height = 0
        if helper:
            para = Paragraph(helper, self.styles["body"])
            _, helper_height = para.wrap(self.content_width - 8, PAGE_HEIGHT)
        self.ensure_space(28 + helper_height)
        self.canvas.setFillColor(colors.HexColor("#DBEAFE"))
        self.canvas.roundRect(self.margin_x, self.y - 18, self.content_width, 18, 5, stroke=0, fill=1)
        self.canvas.setFillColor(colors.HexColor("#111827"))
        self.canvas.setFont("Helvetica-Bold", 10.5)
        self.canvas.drawString(self.margin_x + 8, self.y - 12, title)
        self.y -= 25
        if helper:
            used = self.paragraph(helper, "body", self.margin_x + 2, self.y, self.content_width - 4)
            self.y -= used + 8

    def text_row(self, fields: list[dict], height: float = 19, gap: float = 9) -> None:
        self.ensure_space(height + 24)
        total_units = sum(field.get("units", 1) for field in fields)
        available_width = self.content_width - gap * (len(fields) - 1)
        x = self.margin_x
        for field in fields:
            width = available_width * (field.get("units", 1) / total_units)
            self.canvas.setFillColor(colors.HexColor("#1F2937"))
            self.canvas.setFont("Helvetica", 8)
            self.canvas.drawString(x, self.y, field["label"])
            self.canvas.acroForm.textfield(
                name=self.field_name(field["key"]),
                tooltip=field["label"],
                x=x,
                y=self.y - height - 4,
                width=width,
                height=height,
                borderStyle="solid",
                borderColor=colors.HexColor("#9CA3AF"),
                fillColor=colors.HexColor("#F9FAFB"),
                textColor=colors.black,
                fontName="Helvetica",
                fontSize=8.5,
            )
            x += width + gap
        self.y -= height + 21

    def textarea(self, key: str, label: str, height: float = 48) -> None:
        self.ensure_space(height + 22)
        self.canvas.setFillColor(colors.HexColor("#1F2937"))
        self.canvas.setFont("Helvetica", 8)
        self.canvas.drawString(self.margin_x, self.y, label)
        self.canvas.acroForm.textfield(
            name=self.field_name(key),
            tooltip=label,
            x=self.margin_x,
            y=self.y - height - 4,
            width=self.content_width,
            height=height,
            borderStyle="solid",
            borderColor=colors.HexColor("#9CA3AF"),
            fillColor=colors.HexColor("#F9FAFB"),
            textColor=colors.black,
            fontName="Helvetica",
            fontSize=8.5,
            fieldFlags="multiline",
        )
        self.y -= height + 20

    def checkbox_group(self, key_prefix: str, label: str, options: tuple[str, ...], columns: int = 2) -> None:
        rows = (len(options) + columns - 1) // columns
        self.ensure_space(rows * 16 + 24)
        self.canvas.setFillColor(colors.HexColor("#1F2937"))
        self.canvas.setFont("Helvetica", 8)
        self.canvas.drawString(self.margin_x, self.y, label)
        col_width = self.content_width / columns
        start_y = self.y - 17
        for index, option in enumerate(options):
            row = index // columns
            col = index % columns
            x = self.margin_x + col * col_width
            y = start_y - row * 16
            self.canvas.acroForm.checkbox(
                name=self.field_name(f"{key_prefix}_{option}"),
                tooltip=option,
                x=x,
                y=y,
                size=10,
                borderWidth=0.8,
                borderColor=colors.HexColor("#6B7280"),
                fillColor=colors.white,
                textColor=colors.black,
                buttonStyle="check",
            )
            self.canvas.drawString(x + 15, y + 1, option)
        self.y = start_y - rows * 16 - 8

    def table(self, key_prefix: str, columns: tuple[str, ...], rows: int = 5, row_height: float = 17) -> None:
        header_height = 16
        self.ensure_space(header_height + rows * row_height + 16)
        col_width = self.content_width / len(columns)
        self.canvas.setFillColor(colors.HexColor("#E5E7EB"))
        self.canvas.rect(self.margin_x, self.y - header_height, self.content_width, header_height, stroke=0, fill=1)
        self.canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.canvas.setFont("Helvetica-Bold", 7.5)
        for index, column_label in enumerate(columns):
            x = self.margin_x + index * col_width
            self.canvas.drawString(x + 3, self.y - 11, column_label)
            self.canvas.line(x, self.y, x, self.y - header_height - rows * row_height)
        self.canvas.line(self.margin_x + self.content_width, self.y, self.margin_x + self.content_width, self.y - header_height - rows * row_height)
        for row_index in range(rows + 1):
            y = self.y - header_height - row_index * row_height
            self.canvas.line(self.margin_x, y, self.margin_x + self.content_width, y)
        for row_index in range(rows):
            top = self.y - header_height - row_index * row_height
            for col_index, column_label in enumerate(columns):
                x = self.margin_x + col_index * col_width + 2
                self.canvas.acroForm.textfield(
                    name=self.field_name(f"{key_prefix}_{row_index}_{column_label}"),
                    tooltip=column_label,
                    x=x,
                    y=top - row_height + 2,
                    width=col_width - 4,
                    height=row_height - 4,
                    borderWidth=0,
                    fillColor=colors.white,
                    textColor=colors.black,
                    fontName="Helvetica",
                    fontSize=7.5,
                )
        self.y -= header_height + rows * row_height + 14

    def signature_block(self) -> None:
        self.text_row(
            [
                {"key": "signature", "label": "Signature / approval", "units": 1.2},
                {"key": "printed_name", "label": "Printed name", "units": 1.0},
                {"key": "date", "label": "Date", "units": 0.55},
            ],
            height=21,
        )

    def footer(self) -> None:
        self.canvas.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.canvas.line(self.margin_x, self.bottom_margin + 0.14 * inch, PAGE_WIDTH - self.margin_x, self.bottom_margin + 0.14 * inch)
        text = "DullyPDF original blank template. Review local legal, safety, privacy, payer, and record-retention requirements before production use."
        self.paragraph(text, "small", self.margin_x, self.bottom_margin + 0.08 * inch, self.content_width)

    def save(self) -> None:
        self.footer()
        self.canvas.save()


def render_template(pdf_path: Path, spec: SectionSpec, form_number: str, title: str) -> None:
    subtitle = f"Reusable first-party template for {spec.label.lower()} workflows. Open in DullyPDF to map fields, fill from data, publish by link, or route for signature."
    c = canvas.Canvas(str(pdf_path), pagesize=letter)
    builder = TemplateBuilder(c, form_number, title, subtitle)
    builder.section("Contact and Context")
    builder.text_row(
        [
            {"key": "requester_name", "label": spec.requester_label, "units": 1.15},
            {"key": "phone", "label": "Phone", "units": 0.65},
            {"key": "email", "label": "Email", "units": 1.1},
        ]
    )
    builder.text_row(
        [
            {"key": "location", "label": spec.location_label, "units": 1.25},
            {"key": "reference_id", "label": "Reference / account ID", "units": 0.85},
            {"key": "date", "label": "Date", "units": 0.55},
        ]
    )
    builder.section("Workflow Details")
    builder.text_row(
        [
            {"key": "subject", "label": spec.subject_label, "units": 1.45},
            {"key": "priority", "label": "Priority", "units": 0.5},
            {"key": "due_date", "label": "Due date", "units": 0.6},
        ]
    )
    builder.checkbox_group("checklist", "Checklist", spec.checklist_options, columns=2)
    builder.textarea("details", "Details, background, scope, or special instructions", height=48)
    builder.section("Action Tracking")
    builder.table("actions", spec.table_columns, rows=5)
    builder.checkbox_group("status", "Current status", spec.status_options, columns=5)
    builder.textarea("review_notes", "Review notes, handoff notes, or final outcome", height=42)
    builder.section("Approval")
    builder.signature_block()
    builder.save()


def load_metadata() -> dict:
    if not METADATA_PATH.exists():
        return {}
    return json.loads(METADATA_PATH.read_text())


def write_metadata(metadata: dict) -> None:
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    METADATA_PATH.write_text(f"{json.dumps(metadata, indent=2)}\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate first-party long-tail catalog templates.",
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


def configure_paths(catalog_root: str) -> None:
    global CATALOG_ROOT, METADATA_PATH
    CATALOG_ROOT = Path(catalog_root).resolve()
    METADATA_PATH = CATALOG_ROOT / "local_generated_forms.json"


def metadata_entry(spec: SectionSpec, form_number: str, title: str) -> dict:
    return {
        "filename": filename_for(form_number, title),
        "form_number": form_number,
        "title": title,
        "url": "",
    }


def build_entries(spec: SectionSpec) -> list[dict]:
    titles = build_titles(spec)
    entries: list[dict] = []
    for offset, title in enumerate(titles):
        form_number = f"{spec.prefix} {spec.start_number + offset}"
        entries.append(metadata_entry(spec, form_number, title))
    return entries


def is_spec_managed_file(spec: SectionSpec, path: Path) -> bool:
    match = re.match(rf"^{slugify(spec.prefix)}_(\d+)__", path.name, flags=re.I)
    if not match:
        return False
    number = int(match.group(1))
    return spec.start_number <= number < spec.start_number + spec.count


def cleanup_stale_managed_files(spec: SectionSpec, out_dir: Path, generated_entries: list[dict]) -> None:
    prefix = slugify(spec.prefix)
    expected_names = {entry["filename"] for entry in generated_entries}
    expected_names.update(Path(entry["filename"]).with_suffix(".webp").name for entry in generated_entries)
    for path in out_dir.glob(f"{prefix}_*"):
        if path.suffix.lower() in {".pdf", ".webp"} and is_spec_managed_file(spec, path) and path.name not in expected_names:
            path.unlink()


def render_section(spec: SectionSpec, entries: list[dict]) -> None:
    out_dir = CATALOG_ROOT / spec.section
    out_dir.mkdir(parents=True, exist_ok=True)
    cleanup_stale_managed_files(spec, out_dir, entries)
    for entry in entries:
        render_template(out_dir / entry["filename"], spec, entry["form_number"], entry["title"])


def main() -> int:
    args = parse_args()
    configure_paths(args.catalog_root)
    expected_total = 1000
    total = sum(spec.count for spec in SECTIONS)
    if total != expected_total:
        raise RuntimeError(f"Expected {expected_total} templates, configured {total}")

    CATALOG_ROOT.mkdir(parents=True, exist_ok=True)
    metadata = load_metadata()
    for spec in SECTIONS:
        entries = build_entries(spec)
        if len(entries) != spec.count:
            raise RuntimeError(f"{spec.section} generated {len(entries)} templates, expected {spec.count}")
        generated_filenames = {entry["filename"] for entry in entries}
        generated_form_numbers = {entry["form_number"] for entry in entries}
        existing_entries = [
            entry
            for entry in metadata.get(spec.section, [])
            if (
                entry.get("filename") not in generated_filenames
                and entry.get("form_number") not in generated_form_numbers
            )
        ]
        metadata[spec.section] = existing_entries + entries
        if not args.metadata_only:
            render_section(spec, entries)
        print(f"[generate-first-party-catalog] {spec.section}: {len(entries)} templates")

    write_metadata(dict(sorted(metadata.items())))
    action = "registered" if args.metadata_only else "generated"
    noun = "metadata entries" if args.metadata_only else "PDFs"
    print(f"[generate-first-party-catalog] {action} {total} first-party catalog {noun}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
