"""Unit coverage for Cloud KMS audit-signing helpers."""

from __future__ import annotations

from types import SimpleNamespace

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, utils

from backend.services import cloud_kms_service


class _FakeKmsClient:
    def __init__(self, *, crypto_key=None, versions=None) -> None:
        self.crypto_key = crypto_key or SimpleNamespace(primary=None)
        self.versions = list(versions or [])
        self.last_sign_request = None
        self.last_list_request = None
        self.last_verify_request = None
        self.private_key = ec.generate_private_key(ec.SECP256R1())
        self.public_key_pem = self.private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        ).decode("utf-8")

    def get_crypto_key_version(self, *, name: str):
        for version in self.versions:
            if getattr(version, "name", None) == name:
                return version
        return SimpleNamespace(algorithm="EC_SIGN_P256_SHA256", name=name)

    def get_crypto_key(self, *, name: str):
        return self.crypto_key

    def get_public_key(self, *, name: str):
        return SimpleNamespace(pem=self.public_key_pem)

    def list_crypto_key_versions(self, *, request):
        self.last_list_request = request
        return list(self.versions)

    def asymmetric_sign(self, *, request):
        self.last_sign_request = request
        digest = bytes(request["digest"]["sha256"])
        signature = self.private_key.sign(
            digest,
            ec.ECDSA(utils.Prehashed(hashes.SHA256())),
        )
        return SimpleNamespace(signature=signature)

    def asymmetric_verify(self, *, request):
        self.last_verify_request = request
        return SimpleNamespace(verified=True)


def test_sign_audit_manifest_bytes_uses_cloud_kms_when_configured(monkeypatch) -> None:
    fake_client = _FakeKmsClient(
        versions=[
            SimpleNamespace(
                name="projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/1",
                algorithm=SimpleNamespace(name="EC_SIGN_P256_SHA256"),
            )
        ]
    )
    fake_module = SimpleNamespace(KeyManagementServiceClient=lambda: fake_client)
    monkeypatch.setenv(
        "SIGNING_AUDIT_KMS_KEY",
        "projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/1",
    )
    monkeypatch.setattr(cloud_kms_service, "_require_kms_module", lambda: fake_module)

    envelope = cloud_kms_service.sign_audit_manifest_bytes(b'{"ok":true}')

    assert envelope.method == cloud_kms_service.AUDIT_SIGNATURE_METHOD_KMS
    assert envelope.key_version_name.endswith("/cryptoKeyVersions/1")
    assert envelope.algorithm == "EC_SIGN_P256_SHA256"
    assert envelope.public_key_pem == fake_client.public_key_pem.strip()
    assert fake_client.last_sign_request["name"].endswith("/cryptoKeyVersions/1")
    assert cloud_kms_service.verify_audit_manifest_signature(
        b'{"ok":true}',
        envelope.to_dict(),
    ) is True
    assert fake_client.last_verify_request is None


def test_sign_audit_manifest_bytes_uses_latest_enabled_version_for_crypto_key(monkeypatch) -> None:
    fake_client = _FakeKmsClient(
        crypto_key=SimpleNamespace(primary=None),
        versions=[
            SimpleNamespace(
                name="projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/3",
                algorithm="EC_SIGN_P256_SHA256",
                state=SimpleNamespace(name="DISABLED"),
            ),
            SimpleNamespace(
                name="projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/7",
                algorithm=SimpleNamespace(name="EC_SIGN_P256_SHA256"),
                state=SimpleNamespace(name="ENABLED"),
            ),
            SimpleNamespace(
                name="projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/12",
                algorithm=SimpleNamespace(name="EC_SIGN_P256_SHA256"),
                state=SimpleNamespace(name="ENABLED"),
            ),
        ],
    )
    fake_module = SimpleNamespace(KeyManagementServiceClient=lambda: fake_client)
    monkeypatch.setenv(
        "SIGNING_AUDIT_KMS_KEY",
        "projects/demo/locations/us/keyRings/signing/cryptoKeys/audit",
    )
    monkeypatch.setattr(cloud_kms_service, "_require_kms_module", lambda: fake_module)

    envelope = cloud_kms_service.sign_audit_manifest_bytes(b'{"ok":true}')

    assert envelope.method == cloud_kms_service.AUDIT_SIGNATURE_METHOD_KMS
    assert envelope.key_version_name.endswith("/cryptoKeyVersions/12")
    assert envelope.algorithm == "EC_SIGN_P256_SHA256"
    assert envelope.public_key_pem == fake_client.public_key_pem.strip()
    assert fake_client.last_list_request == {
        "parent": "projects/demo/locations/us/keyRings/signing/cryptoKeys/audit"
    }
    assert fake_client.last_sign_request["name"].endswith("/cryptoKeyVersions/12")


def test_verify_audit_manifest_signature_falls_back_to_live_kms_when_public_key_is_missing(monkeypatch) -> None:
    fake_client = _FakeKmsClient()
    fake_module = SimpleNamespace(KeyManagementServiceClient=lambda: fake_client)
    monkeypatch.setenv(
        "SIGNING_AUDIT_KMS_KEY",
        "projects/demo/locations/us/keyRings/signing/cryptoKeys/audit/cryptoKeyVersions/1",
    )
    monkeypatch.setattr(cloud_kms_service, "_require_kms_module", lambda: fake_module)

    envelope = cloud_kms_service.sign_audit_manifest_bytes(b'{"ok":true}')
    signature = envelope.to_dict()
    signature.pop("publicKeyPem", None)

    assert cloud_kms_service.verify_audit_manifest_signature(b'{"ok":true}', signature) is True
    assert fake_client.last_verify_request["name"].endswith("/cryptoKeyVersions/1")
