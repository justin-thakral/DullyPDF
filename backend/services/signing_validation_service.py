"""Helpers for public validation of completed signing records.

Validation is linear in the embedded audit-event count and performs a constant
number of finalized-artifact reads. The public validation page now proves the
retained source PDF, signed PDF, audit manifest, and audit receipt remain
retrievable from their recorded finalized storage locations.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from backend.firebaseDB.storage_service import download_storage_bytes
from backend.services.signing_pdf_digital_service import async_validate_digital_pdf_signature
from backend.services.signing_audit_service import verify_signing_audit_envelope
from backend.services.signing_invite_service import build_signing_public_app_url
from backend.services.signing_service import (
    SIGNING_STATUS_COMPLETED,
    build_signing_validation_path,
    resolve_document_category_label,
    sha256_hex_for_bytes,
)
from backend.time_utils import now_iso


def build_signing_validation_url(request_id: str, *, public_app_origin: Optional[str] = None) -> str:
    return build_signing_public_app_url(
        build_signing_validation_path(request_id),
        request_origin=public_app_origin,
    )


def _read_retained_artifact(bucket_path: Optional[str]) -> tuple[Optional[bytes], bool]:
    normalized_bucket_path = str(bucket_path or "").strip()
    if not normalized_bucket_path:
        return None, False
    try:
        return download_storage_bytes(normalized_bucket_path), True
    except Exception:
        return None, False


def _hash_matches(actual_sha256: Optional[str], *expected_values: Optional[str]) -> bool:
    normalized_actual = str(actual_sha256 or "").strip().lower()
    if not normalized_actual:
        return False
    normalized_expected = [
        str(value or "").strip().lower()
        for value in expected_values
        if str(value or "").strip()
    ]
    if not normalized_expected:
        return True
    return all(value == normalized_actual for value in normalized_expected)


async def build_signing_validation_payload(record) -> Dict[str, Any]:
    validation_path = build_signing_validation_path(record.id)
    payload: Dict[str, Any] = {
        "available": False,
        "valid": False,
        "status": "unavailable",
        "statusMessage": "The retained validation data for this signing record is unavailable.",
        "validatedAt": now_iso(),
        "requestId": record.id,
        "title": getattr(record, "title", None),
        "sourceDocumentName": record.source_document_name,
        "sourceVersion": getattr(record, "source_version", None),
        "documentCategory": record.document_category,
        "documentCategoryLabel": resolve_document_category_label(record.document_category),
        "completedAt": getattr(record, "completed_at", None),
        "retentionUntil": getattr(record, "retention_until", None),
        "sender": {
            "displayName": getattr(record, "sender_display_name", None),
            "contactEmail": getattr(record, "sender_contact_email", None) or getattr(record, "sender_email", None),
        },
        "signer": {
            "name": record.signer_name,
            "adoptedName": getattr(record, "signature_adopted_name", None),
        },
        "authority": {
            "companyBindingEnabled": bool(getattr(record, "company_binding_enabled", False)),
            "representativeTitle": getattr(record, "representative_title", None),
            "representativeCompanyName": getattr(record, "representative_company_name", None),
            "attestedAt": getattr(record, "authority_attested_at", None),
            "attestationVersion": getattr(record, "authority_attestation_version", None),
            "attestationSha256": getattr(record, "authority_attestation_sha256", None),
            "independentlyVerified": False,
        },
        "validationPath": validation_path,
        "validationUrl": build_signing_validation_url(
            record.id,
            public_app_origin=getattr(record, "public_app_origin", None),
        ),
        "sourcePdfSha256": getattr(record, "source_pdf_sha256", None),
        "signedPdfSha256": getattr(record, "signed_pdf_sha256", None),
        "auditManifestSha256": None,
        "auditEnvelopeSha256": getattr(record, "audit_manifest_sha256", None),
        "auditReceiptSha256": getattr(record, "audit_receipt_sha256", None),
        "checks": [],
        "eventCount": None,
        "signature": None,
        "digitalSignature": None,
        "warnings": [],
    }
    if getattr(record, "status", None) != SIGNING_STATUS_COMPLETED:
        payload["statusMessage"] = "Only completed DullyPDF signing records can be validated."
        return payload
    if not getattr(record, "audit_manifest_bucket_path", None):
        return payload
    envelope_bytes, envelope_available = _read_retained_artifact(getattr(record, "audit_manifest_bucket_path", None))
    if not envelope_available or envelope_bytes is None:
        return payload
    try:
        envelope_payload = json.loads(envelope_bytes.decode("utf-8"))
    except Exception:
        payload["available"] = True
        payload["status"] = "invalid"
        payload["statusMessage"] = "The retained audit manifest could not be decoded."
        return payload

    manifest = dict((envelope_payload or {}).get("manifest") or {})
    document_evidence = dict(manifest.get("documentEvidence") or {})
    signature = dict((envelope_payload or {}).get("signature") or {})
    manifest_sha256 = str((envelope_payload or {}).get("manifestSha256") or "").strip().lower() or None
    envelope_sha256 = sha256_hex_for_bytes(envelope_bytes)
    source_pdf_bytes, source_pdf_available = _read_retained_artifact(getattr(record, "source_pdf_bucket_path", None))
    signed_pdf_bytes, signed_pdf_available = _read_retained_artifact(getattr(record, "signed_pdf_bucket_path", None))
    audit_receipt_bytes, audit_receipt_available = _read_retained_artifact(getattr(record, "audit_receipt_bucket_path", None))
    source_pdf_actual_sha256 = sha256_hex_for_bytes(source_pdf_bytes) if source_pdf_bytes is not None else None
    signed_pdf_actual_sha256 = sha256_hex_for_bytes(signed_pdf_bytes) if signed_pdf_bytes is not None else None
    audit_receipt_actual_sha256 = sha256_hex_for_bytes(audit_receipt_bytes) if audit_receipt_bytes is not None else None
    checks: List[Dict[str, Any]] = [
        {
            "key": "audit_manifest_signature",
            "label": "Audit manifest envelope signature",
            "passed": verify_signing_audit_envelope(envelope_payload),
        },
        {
            "key": "audit_manifest_hash",
            "label": "Stored audit envelope hash matches the retained envelope",
            "passed": _hash_matches(envelope_sha256, getattr(record, "audit_manifest_sha256", None)),
        },
        {
            "key": "source_pdf_retained",
            "label": "Source PDF artifact is retrievable from retained signing storage",
            "passed": source_pdf_available,
        },
        {
            "key": "source_pdf_hash",
            "label": "Source PDF hash matches the retained audit manifest",
            "passed": source_pdf_available and _hash_matches(
                source_pdf_actual_sha256,
                getattr(record, "source_pdf_sha256", None),
                document_evidence.get("sourcePdfSha256"),
            ),
        },
        {
            "key": "signed_pdf_retained",
            "label": "Signed PDF artifact is retrievable from retained signing storage",
            "passed": signed_pdf_available,
        },
        {
            "key": "signed_pdf_hash",
            "label": "Signed PDF hash matches the retained audit manifest",
            "passed": signed_pdf_available and _hash_matches(
                signed_pdf_actual_sha256,
                getattr(record, "signed_pdf_sha256", None),
                document_evidence.get("signedPdfSha256"),
            ),
        },
        {
            "key": "audit_receipt_retained",
            "label": "Audit receipt artifact is retrievable from retained signing storage",
            "passed": audit_receipt_available,
        },
        {
            "key": "audit_receipt_hash",
            "label": "Audit receipt hash matches the retained signing record",
            "passed": audit_receipt_available and _hash_matches(
                audit_receipt_actual_sha256,
                getattr(record, "audit_receipt_sha256", None),
            ),
        },
    ]
    digital_signature = None
    if signed_pdf_bytes is not None:
        try:
            digital_signature = await async_validate_digital_pdf_signature(
                signed_pdf_bytes,
                expected_sha256=document_evidence.get("signedPdfSha256") or getattr(record, "signed_pdf_sha256", None),
            )
        except Exception:
            digital_signature = None
    if digital_signature and digital_signature.present:
        # Product-valid Dully verification is anchored on the retained audit
        # envelope plus the finalized signed-PDF bytes. Certificate trust-chain
        # and TSA semantics stay informational until the repo ships a separate
        # advanced-digital-signature track.
        checks.append(
            {
                "key": "pdf_digital_signature_integrity",
                "label": "Embedded PDF digital signature is intact",
                "passed": bool(digital_signature.intact),
            }
        )
        if digital_signature.expected_sha256_matches is not None:
            checks.append(
                {
                    "key": "pdf_digital_signature_hash",
                    "label": "Embedded PDF digital signature covers the retained signed PDF artifact",
                    "passed": bool(digital_signature.expected_sha256_matches),
                }
            )
    valid = all(bool(check.get("passed")) for check in checks)
    warnings: List[str] = []
    if str(getattr(record, "signed_pdf_digital_signature_method", "") or "").strip().lower() == "dev_pem":
        warnings.append(
            "This record uses DullyPDF's local development signing certificate. It proves integrity in dev, but it is not a publicly trusted production signing identity."
        )
    if bool(getattr(record, "company_binding_enabled", False)):
        warnings.append(
            "DullyPDF records the signer's authority attestation for company-binding requests but does not independently verify corporate authority."
        )
    payload.update(
        {
            "available": True,
            "valid": valid,
            "status": "valid" if valid else "invalid",
            "statusMessage": (
                "DullyPDF verified the retained audit evidence for this completed signing record."
                if valid
                else "DullyPDF could not verify one or more retained signing checks for this record."
            ),
            "sourcePdfSha256": source_pdf_actual_sha256 or document_evidence.get("sourcePdfSha256") or getattr(record, "source_pdf_sha256", None),
            "signedPdfSha256": signed_pdf_actual_sha256 or document_evidence.get("signedPdfSha256") or getattr(record, "signed_pdf_sha256", None),
            "auditManifestSha256": manifest_sha256,
            "auditEnvelopeSha256": envelope_sha256,
            "auditReceiptSha256": audit_receipt_actual_sha256 or getattr(record, "audit_receipt_sha256", None),
            "checks": checks,
            "eventCount": len(list(manifest.get("events") or [])),
            "signature": {
                "method": signature.get("method"),
                "algorithm": signature.get("algorithm"),
                "keyVersionName": signature.get("keyVersionName"),
                "digestSha256": signature.get("digestSha256"),
            },
            "digitalSignature": (
                {
                    "present": digital_signature.present,
                    "valid": digital_signature.valid,
                    "intact": digital_signature.intact,
                    "trusted": digital_signature.trusted,
                    "summary": digital_signature.summary,
                    "signatureCount": digital_signature.signature_count,
                    "fieldName": digital_signature.field_name,
                    "subfilter": digital_signature.subfilter,
                    "coverage": digital_signature.coverage,
                    "modificationLevel": digital_signature.modification_level,
                    "timestampPresent": digital_signature.timestamp_present,
                    "timestampValid": digital_signature.timestamp_valid,
                    "certificateSubject": digital_signature.certificate_subject,
                    "certificateIssuer": digital_signature.certificate_issuer,
                    "certificateSerialNumber": digital_signature.certificate_serial_number,
                    "certificateFingerprintSha256": digital_signature.certificate_fingerprint_sha256,
                    "expectedSha256Matches": digital_signature.expected_sha256_matches,
                    "actualSha256": digital_signature.actual_sha256,
                }
                if digital_signature is not None
                else None
            ),
            "warnings": warnings,
        }
    )
    return payload
