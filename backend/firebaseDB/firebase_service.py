"""Firebase Admin initialization and auth utilities.
"""

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple

import jwt
from firebase_admin import auth as firebase_auth
from firebase_admin import credentials, firestore, get_app, initialize_app, storage

from backend.logging_config import DEBUG_MODE, get_logger


logger = get_logger(__name__)

_firebase_app = None
_firebase_init_error: Optional[Exception] = None
_firebase_project_id: Optional[str] = None


def _is_prod() -> bool:
    return (os.getenv("ENV") or "").strip().lower() in {"prod", "production"}


def _adc_enabled() -> bool:
    return (os.getenv("FIREBASE_USE_ADC") or "").strip().lower() in {"1", "true", "yes", "on"}


def _firebase_service_account_id() -> Optional[str]:
    """Return an explicit signer identity for ADC-backed custom tokens.

    Workload Identity Federation credentials do not expose a local private key,
    so Firebase Admin cannot infer the signing service account from certificate
    data. Supplying the service account email lets the Admin SDK call the IAM
    signing APIs instead of falling back to the metadata server, which does not
    exist on GitHub-hosted runners.
    """

    for env_name in (
        "FIREBASE_SERVICE_ACCOUNT_ID",
        "GOOGLE_SERVICE_ACCOUNT_EMAIL",
        "GCP_SERVICE_ACCOUNT_EMAIL",
    ):
        value = str(os.getenv(env_name) or "").strip()
        if value:
            return value
    return None


@dataclass(frozen=True)
class RequestUser:
    uid: str
    app_user_id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None


def _load_firebase_credentials() -> Tuple[Optional[credentials.Base], Optional[str]]:
    """
    Resolve Firebase Admin credentials from environment.

    This supports either a JSON blob in FIREBASE_CREDENTIALS or a filesystem path
    to a service account file (also via FIREBASE_CREDENTIALS). If the resolved
    payload is an ADC config such as Workload Identity Federation
    (`type=external_account`) or a local gcloud authorized-user file, this
    returns `(None, project_id)` so Firebase Admin falls back to ADC instead of
    trying to parse the file as a service-account certificate.
    """

    def _project_id_from_payload(payload: Any) -> Optional[str]:
        if not isinstance(payload, dict):
            return None
        value = payload.get("project_id")
        text = str(value or "").strip()
        return text or None

    def _is_service_account_payload(payload: Any) -> bool:
        if not isinstance(payload, dict):
            return False
        credential_type = str(payload.get("type") or "").strip().lower()
        return credential_type == "service_account" or "private_key" in payload

    raw = os.getenv("FIREBASE_CREDENTIALS", "").strip()
    if not raw:
        raw = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if not raw:
        return None, None
    candidate_path = os.path.expanduser(raw)
    if os.path.exists(candidate_path):
        payload = None
        try:
            with open(candidate_path, "r", encoding="utf-8") as handle:
                payload = json.loads(handle.read())
        except Exception:
            payload = None
        project_id = _project_id_from_payload(payload)
        if payload is not None and not _is_service_account_payload(payload):
            return None, project_id
        return credentials.Certificate(candidate_path), project_id
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("FIREBASE_CREDENTIALS must be JSON or a valid file path") from exc
    project_id = _project_id_from_payload(payload)
    if not _is_service_account_payload(payload):
        return None, project_id
    if isinstance(payload, dict) and "private_key" in payload:
        payload = dict(payload)
        payload["private_key"] = payload["private_key"].replace("\\n", "\n")
    return credentials.Certificate(payload), project_id


def _check_revoked_enabled() -> bool:
    """
    Decide whether revocation checks are enabled (explicit env override or prod default).
    """
    raw = os.getenv("FIREBASE_CHECK_REVOKED", "").strip()
    if raw:
        return raw.lower() in {"1", "true", "yes"}
    return (os.getenv("ENV") or "").strip().lower() in {"prod", "production"}


def _validate_prod_firebase_auth_mode() -> None:
    if not _is_prod():
        return
    if not _adc_enabled():
        raise RuntimeError("Firebase Admin must use ADC in prod (set FIREBASE_USE_ADC=true).")
    forbidden = []
    if os.getenv("FIREBASE_CREDENTIALS", "").strip():
        forbidden.append("FIREBASE_CREDENTIALS")
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip():
        forbidden.append("GOOGLE_APPLICATION_CREDENTIALS")
    if forbidden:
        raise RuntimeError(
            "Firebase Admin must use ADC in prod; unset "
            + ", ".join(forbidden)
            + "."
        )


def _attach_existing_default_app() -> bool:
    """Reuse an already-initialized default Firebase app when present.

    Broad test suites and some integration helpers can initialize Firebase
    outside this module. Reattaching here keeps initialization idempotent
    instead of turning that perfectly valid state into a cached startup error.
    """

    global _firebase_app
    global _firebase_init_error

    try:
        app = get_app()
    except Exception:
        return False
    _firebase_app = app
    _firebase_init_error = None
    return True


def _is_duplicate_default_app_error(exc: Exception) -> bool:
    message = str(exc or "")
    return isinstance(exc, ValueError) and "default Firebase app already exists" in message


def init_firebase() -> None:
    """Initialize Firebase Admin once and cache failures.
    """
    global _firebase_app
    global _firebase_init_error
    global _firebase_project_id
    if _firebase_app:
        return
    if _attach_existing_default_app():
        return
    if _firebase_init_error:
        return
    try:
        _validate_prod_firebase_auth_mode()
        cred, embedded_project_id = _load_firebase_credentials()
        project_id = (
            os.getenv("FIREBASE_PROJECT_ID")
            or embedded_project_id
            or os.getenv("GCP_PROJECT_ID")
            or None
        )
        options: Dict[str, Any] = {}
        if project_id:
            options["projectId"] = project_id
        service_account_id = _firebase_service_account_id()
        if service_account_id:
            options["serviceAccountId"] = service_account_id
        if cred:
            _firebase_app = initialize_app(cred, options or None)
        else:
            _firebase_app = initialize_app(options=options or None)
        _firebase_project_id = project_id
        logger.info("Firebase Admin initialized (project=%s)", project_id or "default")
    except Exception as exc:
        if _is_duplicate_default_app_error(exc) and _attach_existing_default_app():
            logger.info("Reused existing default Firebase app after duplicate initialization attempt.")
            return
        _firebase_init_error = exc
        logger.exception("Firebase Admin initialization failed: %s", exc)


def get_firestore_client() -> firestore.Client:
    """Return a Firestore client, initializing Firebase if needed.
    """
    init_firebase()
    if _firebase_init_error:
        raise RuntimeError("Firebase authentication is not configured")
    return firestore.client(app=_firebase_app)


def get_storage_bucket(bucket_name: str):
    """Return a Storage bucket client after Firebase initialization.
    """
    init_firebase()
    if _firebase_init_error:
        raise RuntimeError("Firebase authentication is not configured")
    return storage.bucket(bucket_name, app=_firebase_app)


def verify_id_token(authorization: Optional[str]) -> Dict[str, Any]:
    """
    Validate the Firebase ID token from Authorization header.

    Returns the decoded token payload or raises for invalid/missing tokens.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        raise ValueError("Missing Authorization token")
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise ValueError("Missing Authorization token")

    init_firebase()
    if _firebase_init_error:
        raise RuntimeError("Firebase authentication is not configured")

    try:
        skew_seconds = int(os.getenv("FIREBASE_CLOCK_SKEW_SECONDS", "60"))
    except ValueError:
        skew_seconds = 60

    try:
        return firebase_auth.verify_id_token(
            token,
            app=_firebase_app,
            clock_skew_seconds=skew_seconds,
            check_revoked=_check_revoked_enabled(),
        )
    except Exception as exc:
        if DEBUG_MODE:
            try:
                claims = jwt.decode(token, options={"verify_signature": False})
                debug_claims = {
                    "aud": claims.get("aud"),
                    "iss": claims.get("iss"),
                    "sub": claims.get("sub"),
                    "user_id": claims.get("user_id"),
                    "email": claims.get("email"),
                }
                logger.debug("Firebase token claims (unverified): %s", debug_claims)
            except Exception as decode_exc:
                logger.debug("Failed to decode token for debugging: %s", decode_exc)
        raise exc
