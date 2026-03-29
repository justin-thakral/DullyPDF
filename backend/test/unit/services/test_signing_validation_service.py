"""Unit coverage for public signing validation payloads."""

from __future__ import annotations

import asyncio
import hashlib
import json
from types import SimpleNamespace

from backend.services import signing_validation_service


def _record(**overrides):
    payload = {
        "id": "req-1",
        "status": "completed",
        "title": "Bravo Packet",
        "source_document_name": "Bravo Packet.pdf",
        "source_version": "workspace:form-alpha:abc123",
        "document_category": "ordinary_business_form",
        "completed_at": "2026-03-28T10:00:00+00:00",
        "retention_until": "2033-03-28T10:00:00+00:00",
        "sender_display_name": "Owner",
        "sender_contact_email": "owner@example.com",
        "sender_email": "owner@example.com",
        "signer_name": "Alex Signer",
        "signature_adopted_name": "Alex Signer",
        "source_pdf_bucket_path": "gs://signing/source.pdf",
        "signed_pdf_bucket_path": "gs://signing/signed.pdf",
        "audit_manifest_bucket_path": "gs://signing/manifest.json",
        "audit_receipt_bucket_path": "gs://signing/receipt.pdf",
        "public_app_origin": None,
        "signed_pdf_digital_signature_method": None,
    }
    payload.update(overrides)
    return SimpleNamespace(**payload)


def test_build_signing_validation_payload_includes_retrieved_artifact_and_pdf_signature_checks(mocker) -> None:
    source_pdf_bytes = b"%PDF-1.7 source"
    signed_pdf_bytes = b"%PDF-1.7 digitally signed"
    audit_receipt_bytes = b"%PDF-1.7 audit receipt"
    source_sha256 = hashlib.sha256(source_pdf_bytes).hexdigest()
    signed_sha256 = hashlib.sha256(signed_pdf_bytes).hexdigest()
    receipt_sha256 = hashlib.sha256(audit_receipt_bytes).hexdigest()
    manifest_payload = {
        "events": [{"eventType": "completed"}],
        "documentEvidence": {
            "sourcePdfSha256": source_sha256,
            "signedPdfSha256": signed_sha256,
        },
    }
    manifest_sha256 = hashlib.sha256(json.dumps(manifest_payload).encode("utf-8")).hexdigest()
    envelope_payload = {
        "manifestSha256": manifest_sha256,
        "manifest": manifest_payload,
        "signature": {
            "method": "cloud_kms_asymmetric_sign",
            "algorithm": "EC_SIGN_P256_SHA256",
            "keyVersionName": "projects/test/locations/us-east4/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1",
            "digestSha256": "e" * 64,
        },
    }
    envelope_bytes = json.dumps(envelope_payload).encode("utf-8")
    audit_manifest_sha256 = hashlib.sha256(envelope_bytes).hexdigest()
    record = _record(
        source_pdf_sha256=source_sha256,
        signed_pdf_sha256=signed_sha256,
        audit_manifest_sha256=audit_manifest_sha256,
        audit_receipt_sha256=receipt_sha256,
        public_app_origin="http://127.0.0.1:5173",
        signed_pdf_digital_signature_method="dev_pem",
    )
    mocker.patch.object(
        signing_validation_service,
        "download_storage_bytes",
        side_effect=lambda bucket_path: {
            "gs://signing/source.pdf": source_pdf_bytes,
            "gs://signing/signed.pdf": signed_pdf_bytes,
            "gs://signing/manifest.json": envelope_bytes,
            "gs://signing/receipt.pdf": audit_receipt_bytes,
        }[bucket_path],
    )
    mocker.patch.object(signing_validation_service, "verify_signing_audit_envelope", return_value=True)
    mocker.patch.object(
        signing_validation_service,
        "async_validate_digital_pdf_signature",
        return_value=SimpleNamespace(
            present=True,
            valid=False,
            intact=True,
            trusted=False,
            summary="INTACT:UNTRUSTED,UNTOUCHED",
            signature_count=1,
            field_name="DullyPDFDigitalSignature",
            subfilter="/ETSI.CAdES.detached",
            coverage="ENTIRE_FILE",
            modification_level="NONE",
            timestamp_present=True,
            timestamp_valid=True,
            certificate_subject="CN=DullyPDF Test Signer",
            certificate_issuer="CN=DullyPDF Test Issuer",
            certificate_serial_number="01",
            certificate_fingerprint_sha256="f" * 64,
            expected_sha256_matches=True,
            actual_sha256=signed_sha256,
        ),
    )

    payload = asyncio.run(signing_validation_service.build_signing_validation_payload(record))

    assert payload["available"] is True
    assert payload["valid"] is True
    assert payload["sourcePdfSha256"] == source_sha256
    assert payload["signedPdfSha256"] == signed_sha256
    assert payload["auditManifestSha256"] == manifest_sha256
    assert payload["auditEnvelopeSha256"] == audit_manifest_sha256
    assert payload["auditReceiptSha256"] == receipt_sha256
    assert payload["validationUrl"].startswith("http://127.0.0.1:5173/verify-signing/")
    assert payload["warnings"] == [
        "This record uses DullyPDF's local development signing certificate. It proves integrity in dev, but it is not a publicly trusted production signing identity."
    ]
    check_map = {check["key"]: check["passed"] for check in payload["checks"]}
    assert check_map["source_pdf_retained"] is True
    assert check_map["source_pdf_hash"] is True
    assert check_map["signed_pdf_retained"] is True
    assert check_map["signed_pdf_hash"] is True
    assert check_map["audit_receipt_retained"] is True
    assert check_map["audit_receipt_hash"] is True
    assert check_map["pdf_digital_signature_integrity"] is True
    assert check_map["pdf_digital_signature_hash"] is True


def test_build_signing_validation_payload_fails_when_finalized_artifacts_are_missing(mocker) -> None:
    manifest_payload = {
        "events": [{"eventType": "completed"}],
        "documentEvidence": {
            "sourcePdfSha256": "a" * 64,
            "signedPdfSha256": "b" * 64,
        },
    }
    envelope_payload = {
        "manifestSha256": hashlib.sha256(json.dumps(manifest_payload).encode("utf-8")).hexdigest(),
        "manifest": manifest_payload,
        "signature": {
            "method": "cloud_kms_asymmetric_sign",
            "algorithm": "EC_SIGN_P256_SHA256",
            "keyVersionName": "projects/test/locations/us-east4/keyRings/ring/cryptoKeys/key/cryptoKeyVersions/1",
            "digestSha256": "e" * 64,
        },
    }
    envelope_bytes = json.dumps(envelope_payload).encode("utf-8")
    audit_manifest_sha256 = hashlib.sha256(envelope_bytes).hexdigest()
    record = _record(
        source_pdf_sha256="a" * 64,
        signed_pdf_sha256="b" * 64,
        audit_manifest_sha256=audit_manifest_sha256,
        audit_receipt_sha256="d" * 64,
    )
    mocker.patch.object(
        signing_validation_service,
        "download_storage_bytes",
        side_effect=lambda bucket_path: (
            envelope_bytes
            if bucket_path == "gs://signing/manifest.json"
            else (_ for _ in ()).throw(FileNotFoundError(bucket_path))
        ),
    )
    mocker.patch.object(signing_validation_service, "verify_signing_audit_envelope", return_value=True)
    digital_signature_mock = mocker.patch.object(
        signing_validation_service,
        "async_validate_digital_pdf_signature",
    )

    payload = asyncio.run(signing_validation_service.build_signing_validation_payload(record))

    assert payload["available"] is True
    assert payload["valid"] is False
    check_map = {check["key"]: check["passed"] for check in payload["checks"]}
    assert check_map["source_pdf_retained"] is False
    assert check_map["source_pdf_hash"] is False
    assert check_map["signed_pdf_retained"] is False
    assert check_map["signed_pdf_hash"] is False
    assert check_map["audit_receipt_retained"] is False
    assert check_map["audit_receipt_hash"] is False
    digital_signature_mock.assert_not_called()


def test_build_signing_validation_payload_is_unavailable_when_manifest_cannot_be_loaded(mocker) -> None:
    record = _record(
        source_pdf_sha256="a" * 64,
        signed_pdf_sha256="b" * 64,
        audit_manifest_sha256="c" * 64,
        audit_receipt_sha256="d" * 64,
    )
    mocker.patch.object(signing_validation_service, "download_storage_bytes", side_effect=FileNotFoundError("missing"))

    payload = asyncio.run(signing_validation_service.build_signing_validation_payload(record))

    assert payload["available"] is False
    assert payload["valid"] is False
    assert payload["status"] == "unavailable"
    assert payload["checks"] == []
