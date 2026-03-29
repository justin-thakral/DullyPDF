"""Owner-only dispute package assembly for completed signing requests.

The export bundles a constant number of retained artifacts plus generated JSON
metadata files, so assembly is O(total_bytes) in the packaged artifact size.
The package is intentionally owner-facing because it includes detailed dispute
evidence that is more sensitive than the public audit receipt.
"""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
import json
from typing import Any, Dict
from zipfile import ZIP_DEFLATED, ZipFile

from backend.firebaseDB.storage_service import download_storage_bytes
from backend.services.pdf_service import sanitize_basename_segment
from backend.services.signing_service import (
    SIGNING_ARTIFACT_AUDIT_MANIFEST,
    SIGNING_ARTIFACT_AUDIT_RECEIPT,
    SIGNING_ARTIFACT_DISPUTE_PACKAGE,
    SIGNING_ARTIFACT_SIGNED_PDF,
    SIGNING_ARTIFACT_SOURCE_PDF,
    SIGNING_STATUS_COMPLETED,
    build_signing_public_path,
    build_signing_validation_path,
)
from backend.services.signing_storage_service import resolve_signing_storage_read_bucket_path
from backend.services.signing_validation_service import build_signing_validation_payload


@dataclass(frozen=True)
class OwnerDisputePackage:
    filename: str
    media_type: str
    body: bytes


def owner_dispute_package_available(record: Any) -> bool:
    return bool(
        getattr(record, "status", None) == SIGNING_STATUS_COMPLETED
        and getattr(record, "source_pdf_bucket_path", None)
        and getattr(record, "signed_pdf_bucket_path", None)
        and getattr(record, "audit_manifest_bucket_path", None)
        and getattr(record, "audit_receipt_bucket_path", None)
    )


def _download_retained_artifact(bucket_path: str, *, retain_until: str | None) -> bytes:
    readable_bucket_path = resolve_signing_storage_read_bucket_path(
        bucket_path,
        retain_until=retain_until,
    )
    return download_storage_bytes(readable_bucket_path)


def _build_delivery_metadata(record: Any) -> Dict[str, Any]:
    public_link_version = getattr(record, "public_link_version", None) or 1
    public_path = (
        build_signing_public_path(record.id, public_link_version)
        if getattr(record, "status", None) in {"sent", "completed"}
        else None
    )
    return {
        "requestId": record.id,
        "sourceDocumentName": getattr(record, "source_document_name", None),
        "sender": {
            "displayName": getattr(record, "sender_display_name", None),
            "email": getattr(record, "sender_email", None),
            "contactEmail": getattr(record, "sender_contact_email", None),
        },
        "signer": {
            "name": getattr(record, "signer_name", None),
            "email": getattr(record, "signer_email", None),
        },
        "invite": {
            "method": getattr(record, "invite_method", None),
            "provider": getattr(record, "invite_provider", None),
            "providerMessageId": getattr(record, "invite_message_id", None),
            "deliveryStatus": getattr(record, "invite_delivery_status", None),
            "lastAttemptAt": getattr(record, "invite_last_attempt_at", None),
            "sentAt": getattr(record, "invite_sent_at", None),
            "deliveryError": getattr(record, "invite_delivery_error", None),
            "deliveryErrorCode": getattr(record, "invite_delivery_error_code", None),
            "manualLinkSharedAt": getattr(record, "manual_link_shared_at", None),
            "publicLinkVersion": public_link_version,
            "publicLinkRevokedAt": getattr(record, "public_link_revoked_at", None),
            "publicLinkLastReissuedAt": getattr(record, "public_link_last_reissued_at", None),
            "publicPath": public_path,
            "validationPath": build_signing_validation_path(record.id),
            "publicAppOrigin": getattr(record, "public_app_origin", None),
        },
        "verification": {
            "required": bool(getattr(record, "verification_required", False)),
            "method": getattr(record, "verification_method", None),
            "completedAt": getattr(record, "completed_verification_completed_at", None)
            or getattr(record, "verification_completed_at", None),
            "sessionId": getattr(record, "completed_verification_session_id", None),
        },
    }


async def build_owner_dispute_package(record: Any) -> OwnerDisputePackage:
    if not owner_dispute_package_available(record):
        raise FileNotFoundError("Signing artifact is not available")

    source_pdf_bytes = _download_retained_artifact(
        str(getattr(record, "source_pdf_bucket_path", "") or ""),
        retain_until=getattr(record, "retention_until", None),
    )
    signed_pdf_bytes = _download_retained_artifact(
        str(getattr(record, "signed_pdf_bucket_path", "") or ""),
        retain_until=getattr(record, "retention_until", None),
    )
    audit_manifest_bytes = _download_retained_artifact(
        str(getattr(record, "audit_manifest_bucket_path", "") or ""),
        retain_until=getattr(record, "retention_until", None),
    )
    audit_receipt_bytes = _download_retained_artifact(
        str(getattr(record, "audit_receipt_bucket_path", "") or ""),
        retain_until=getattr(record, "retention_until", None),
    )
    validation_snapshot = await build_signing_validation_payload(record)
    delivery_metadata = _build_delivery_metadata(record)

    document_base_name = sanitize_basename_segment(
        getattr(record, "source_document_name", None) or "document",
        "document",
    )
    archive_base_name = sanitize_basename_segment(
        f"{getattr(record, 'source_document_name', None) or 'document'}-{SIGNING_ARTIFACT_DISPUTE_PACKAGE.replace('_', '-')}",
        "dispute-package",
    )

    buffer = BytesIO()
    with ZipFile(buffer, mode="w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "README.txt",
            (
                "DullyPDF dispute package\n\n"
                "This owner-only export bundles the retained source PDF, retained signed PDF, "
                "audit receipt, owner audit manifest, a validation snapshot, and invite/delivery metadata "
                "for one completed signing request.\n"
            ),
        )
        archive.writestr(f"{document_base_name}-{SIGNING_ARTIFACT_SOURCE_PDF.replace('_', '-')}.pdf", source_pdf_bytes)
        archive.writestr(f"{document_base_name}-{SIGNING_ARTIFACT_SIGNED_PDF.replace('_', '-')}.pdf", signed_pdf_bytes)
        archive.writestr(
            f"{document_base_name}-{SIGNING_ARTIFACT_AUDIT_RECEIPT.replace('_', '-')}.pdf",
            audit_receipt_bytes,
        )
        archive.writestr(
            f"{document_base_name}-{SIGNING_ARTIFACT_AUDIT_MANIFEST.replace('_', '-')}-envelope.json",
            audit_manifest_bytes,
        )
        archive.writestr(
            f"{document_base_name}-validation-snapshot.json",
            json.dumps(validation_snapshot, indent=2, sort_keys=True).encode("utf-8"),
        )
        archive.writestr(
            f"{document_base_name}-delivery-metadata.json",
            json.dumps(delivery_metadata, indent=2, sort_keys=True).encode("utf-8"),
        )
    return OwnerDisputePackage(
        filename=f"{archive_base_name}.zip",
        media_type="application/zip",
        body=buffer.getvalue(),
    )
