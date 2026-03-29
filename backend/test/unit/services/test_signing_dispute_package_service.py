from __future__ import annotations

import asyncio
import json
from io import BytesIO
from types import SimpleNamespace
from zipfile import ZipFile

from backend.services import signing_dispute_package_service


def test_build_owner_dispute_package_bundles_retained_artifacts_and_metadata(mocker) -> None:
    source_bytes = b"%PDF-source\n"
    signed_bytes = b"%PDF-signed\n"
    manifest_bytes = b'{"audit":"manifest"}\n'
    receipt_bytes = b"%PDF-receipt\n"
    record = SimpleNamespace(
        id="req-1",
        status="completed",
        source_document_name="Bravo Packet",
        source_pdf_bucket_path="gs://signing/source.pdf",
        signed_pdf_bucket_path="gs://signing/signed.pdf",
        audit_manifest_bucket_path="gs://signing/audit.json",
        audit_receipt_bucket_path="gs://signing/audit-receipt.pdf",
        retention_until="2033-03-28T00:00:00+00:00",
        public_link_version=2,
        sender_display_name="Owner Example",
        sender_email="owner@example.com",
        sender_contact_email="owner-contact@example.com",
        signer_name="Ada Lovelace",
        signer_email="ada@example.com",
        invite_method="email",
        invite_provider="gmail_api",
        invite_message_id="gmail-message-1",
        invite_delivery_status="sent",
        invite_last_attempt_at="2026-03-28T10:00:00Z",
        invite_sent_at="2026-03-28T10:01:00Z",
        invite_delivery_error=None,
        invite_delivery_error_code=None,
        manual_link_shared_at=None,
        public_link_revoked_at=None,
        public_link_last_reissued_at="2026-03-28T10:02:00Z",
        public_app_origin="https://app.example.com",
        verification_required=True,
        verification_method="email_otp",
        verification_completed_at="2026-03-28T10:03:00Z",
        completed_verification_completed_at="2026-03-28T10:04:00Z",
        completed_verification_session_id="verify-session-1",
    )
    mocker.patch.object(
        signing_dispute_package_service,
        "resolve_signing_storage_read_bucket_path",
        side_effect=lambda path, retain_until=None: f"read::{path}::{retain_until}",
    )
    mocker.patch.object(
        signing_dispute_package_service,
        "download_storage_bytes",
        side_effect=[
            source_bytes,
            signed_bytes,
            manifest_bytes,
            receipt_bytes,
        ],
    )
    mocker.patch.object(
        signing_dispute_package_service,
        "build_signing_validation_payload",
        return_value={
            "requestId": "req-1",
            "status": "valid",
            "validationUrl": "https://app.example.com/verify-signing/packet-token",
        },
    )
    mocker.patch.object(
        signing_dispute_package_service,
        "build_signing_public_path",
        return_value="/sign/public-token-1",
    )
    mocker.patch.object(
        signing_dispute_package_service,
        "build_signing_validation_path",
        return_value="/verify-signing/validation-token-1",
    )

    package = asyncio.run(signing_dispute_package_service.build_owner_dispute_package(record))

    assert package.filename == "Bravo_Packet-dispute-package.zip"
    assert package.media_type == "application/zip"

    with ZipFile(BytesIO(package.body), "r") as archive:
        names = sorted(archive.namelist())
        assert names == sorted([
            "README.txt",
            "Bravo_Packet-audit-manifest-envelope.json",
            "Bravo_Packet-audit-receipt.pdf",
            "Bravo_Packet-delivery-metadata.json",
            "Bravo_Packet-signed-pdf.pdf",
            "Bravo_Packet-source-pdf.pdf",
            "Bravo_Packet-validation-snapshot.json",
        ])
        assert archive.read("Bravo_Packet-source-pdf.pdf") == source_bytes
        assert archive.read("Bravo_Packet-signed-pdf.pdf") == signed_bytes
        assert archive.read("Bravo_Packet-audit-manifest-envelope.json") == manifest_bytes
        assert archive.read("Bravo_Packet-audit-receipt.pdf") == receipt_bytes
        validation_snapshot = json.loads(archive.read("Bravo_Packet-validation-snapshot.json").decode("utf-8"))
        delivery_metadata = json.loads(archive.read("Bravo_Packet-delivery-metadata.json").decode("utf-8"))

    assert validation_snapshot["validationUrl"] == "https://app.example.com/verify-signing/packet-token"
    assert delivery_metadata["requestId"] == "req-1"
    assert delivery_metadata["invite"]["providerMessageId"] == "gmail-message-1"
    assert delivery_metadata["invite"]["publicPath"] == "/sign/public-token-1"
    assert delivery_metadata["invite"]["validationPath"] == "/verify-signing/validation-token-1"
    assert delivery_metadata["verification"]["required"] is True
    assert delivery_metadata["verification"]["sessionId"] == "verify-session-1"
