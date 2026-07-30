#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VALIDATOR="${SCRIPT_DIR}/validate-form-catalog-release.py"
PRODUCTION_LOCK="${SCRIPT_DIR}/form-catalog-production-lock.sh"
GCS_TRANSPORT="${SCRIPT_DIR}/form-catalog-gcs-transport.py"

ACTION="stage"
MANIFEST=""
FROZEN_LEDGER_MANIFEST=""
ASSET_ROOT=""
BUCKET_URL=""
PROJECT_ID=""
EXPECTED_COMMIT=""
ACTIVE_OBJECT="catalog-release-state/active.json"
MAX_FORMS="1000"
HOSTING_EVIDENCE=""
ACTIVE_MAPPING_EVIDENCE=""
ACTIVE_RELEASE_CONTRACT="form_catalog_releases/active.json"
FORM_CATALOG_DATA="frontend/src/config/formCatalogData.mjs"
LIVE_REPORT=""
BROWSER_REPORT=""
SAMPLE_PLAN=""
SELECTION=""
BUILD_REPORT=""
EXPECTED_DEPLOYMENT_COMMIT=""
EXPECTED_WORKFLOW_RUN_ID=""
EXPECTED_WORKFLOW_RUN_ATTEMPT=""
EXTERNAL_PRODUCTION_LOCK_STATE=""
EXTERNAL_PRODUCTION_LOCK_OWNER=""
INVENTORY_REPORT=""
GCS_WORKERS="12"
GCS_WORKERS_EXPLICIT=0
GCS_PAGE_SIZE="1000"
GCS_TIMEOUT_SECONDS="60"
FORM_CATALOG_PYTHON_BIN="${FORM_CATALOG_PYTHON_BIN:-${REPO_ROOT}/backend/.venv/bin/python}"
EXECUTE=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-form-catalog-release.sh \
    --manifest <release.json> \
    --frozen-ledger-manifest <frozen-ledger-manifest.json> \
    --asset-root <directory> \
    --bucket <gs://bucket> \
    --project <gcp-project> \
    [--action validate|stage|promote] \
    [--expected-commit <git-sha>] \
    [--active-object <object-path>] \
    [--max-forms <count>] \
    [--hosting-evidence <hosting.json>] \
    [--active-mapping-evidence <active-mapping.json>] \
    [--active-release-contract <active.json>] \
    [--form-catalog-data <formCatalogData.mjs>] \
    [--live-report <live-http-report.json>] \
    [--browser-report <browser-canary-report.json>] \
    [--sample-plan <live-samples.json>] \
    [--selection <selection.json>] \
    [--build-report <build-report.json>] \
    [--expected-deployment-commit <git-sha>] \
    [--expected-workflow-run-id <run-id>] \
    [--expected-workflow-run-attempt <attempt>] \
    [--external-production-lock-state <lock-state.json>] \
    [--external-production-lock-owner <owner-token>] \
    [--inventory-report <inventory-evidence.json>] \
    [--gcs-workers <1-32>] \
    [--gcs-page-size <1-1000>] \
    [--gcs-timeout-seconds <positive-seconds>] \
    [--execute]

The command is a dry run unless --execute is present.
Set FORM_CATALOG_PYTHON_BIN to override the default pinned backend interpreter.

Actions:
  validate  Validate the local manifest and assets without cloud access.
  stage     Add immutable release-scoped assets and the release manifest.
  promote   Verify staged assets, compare the current release with
            previousReleaseId, validate exact-hosting, live HTTP, and browser
            evidence, then conditionally update the active pointer.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --action)
      ACTION="${2:-}"
      shift 2
      ;;
    --manifest)
      MANIFEST="${2:-}"
      shift 2
      ;;
    --frozen-ledger-manifest)
      FROZEN_LEDGER_MANIFEST="${2:-}"
      shift 2
      ;;
    --asset-root)
      ASSET_ROOT="${2:-}"
      shift 2
      ;;
    --bucket)
      BUCKET_URL="${2:-}"
      shift 2
      ;;
    --project)
      PROJECT_ID="${2:-}"
      shift 2
      ;;
    --expected-commit)
      EXPECTED_COMMIT="${2:-}"
      shift 2
      ;;
    --active-object)
      ACTIVE_OBJECT="${2:-}"
      shift 2
      ;;
    --max-forms)
      MAX_FORMS="${2:-}"
      shift 2
      ;;
    --hosting-evidence)
      HOSTING_EVIDENCE="${2:-}"
      shift 2
      ;;
    --active-mapping-evidence)
      ACTIVE_MAPPING_EVIDENCE="${2:-}"
      shift 2
      ;;
    --active-release-contract)
      ACTIVE_RELEASE_CONTRACT="${2:-}"
      shift 2
      ;;
    --form-catalog-data)
      FORM_CATALOG_DATA="${2:-}"
      shift 2
      ;;
    --live-report)
      LIVE_REPORT="${2:-}"
      shift 2
      ;;
    --browser-report)
      BROWSER_REPORT="${2:-}"
      shift 2
      ;;
    --sample-plan)
      SAMPLE_PLAN="${2:-}"
      shift 2
      ;;
    --selection)
      SELECTION="${2:-}"
      shift 2
      ;;
    --build-report)
      BUILD_REPORT="${2:-}"
      shift 2
      ;;
    --expected-deployment-commit)
      EXPECTED_DEPLOYMENT_COMMIT="${2:-}"
      shift 2
      ;;
    --expected-workflow-run-id)
      EXPECTED_WORKFLOW_RUN_ID="${2:-}"
      shift 2
      ;;
    --expected-workflow-run-attempt)
      EXPECTED_WORKFLOW_RUN_ATTEMPT="${2:-}"
      shift 2
      ;;
    --external-production-lock-state)
      EXTERNAL_PRODUCTION_LOCK_STATE="${2:-}"
      shift 2
      ;;
    --external-production-lock-owner)
      EXTERNAL_PRODUCTION_LOCK_OWNER="${2:-}"
      shift 2
      ;;
    --inventory-report)
      INVENTORY_REPORT="${2:-}"
      shift 2
      ;;
    --gcs-workers)
      GCS_WORKERS="${2:-}"
      GCS_WORKERS_EXPLICIT=1
      shift 2
      ;;
    --gcs-page-size)
      GCS_PAGE_SIZE="${2:-}"
      shift 2
      ;;
    --gcs-timeout-seconds)
      GCS_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

case "${ACTION}" in
  validate|stage|promote) ;;
  *)
    echo "Expected --action validate|stage|promote." >&2
    exit 1
    ;;
esac

if [[ -z "${MANIFEST}" ]]; then
  echo "--manifest is required." >&2
  exit 1
fi
if [[ -z "${FROZEN_LEDGER_MANIFEST}" ]]; then
  echo "--frozen-ledger-manifest is required for every deployment action." >&2
  exit 1
fi
if [[ "${MANIFEST}" != /* ]]; then
  MANIFEST="${REPO_ROOT}/${MANIFEST}"
fi
if [[ "${FROZEN_LEDGER_MANIFEST}" != /* ]]; then
  FROZEN_LEDGER_MANIFEST="${REPO_ROOT}/${FROZEN_LEDGER_MANIFEST}"
fi
if [[ -z "${ASSET_ROOT}" ]]; then
  ASSET_ROOT="$(dirname "${MANIFEST}")"
elif [[ "${ASSET_ROOT}" != /* ]]; then
  ASSET_ROOT="${REPO_ROOT}/${ASSET_ROOT}"
fi
if [[ ! "${MAX_FORMS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--max-forms must be a positive integer." >&2
  exit 1
fi
if [[ ! "${GCS_WORKERS}" =~ ^[1-9][0-9]*$ ]] \
  || (( GCS_WORKERS < 1 || GCS_WORKERS > 32 )); then
  echo "--gcs-workers must be an integer from 1 through 32." >&2
  exit 1
fi
if [[ ! "${GCS_PAGE_SIZE}" =~ ^[1-9][0-9]*$ ]] \
  || (( GCS_PAGE_SIZE < 1 || GCS_PAGE_SIZE > 1000 )); then
  echo "--gcs-page-size must be an integer from 1 through 1000." >&2
  exit 1
fi
if [[ ! "${GCS_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--gcs-timeout-seconds must be a positive integer." >&2
  exit 1
fi
if [[ "${ACTION}" == "validate" ]]; then
  if [[ -n "${INVENTORY_REPORT}" \
    || "${GCS_WORKERS_EXPLICIT}" == "1" \
    || "${GCS_PAGE_SIZE}" != "1000" \
    || "${GCS_TIMEOUT_SECONDS}" != "60" ]]; then
    echo "GCS transport arguments are not valid with --action validate." >&2
    exit 1
  fi
elif [[ "${ACTION}" == "promote" && "${GCS_WORKERS_EXPLICIT}" == "1" ]]; then
  echo "--gcs-workers is only valid with --action stage." >&2
  exit 1
fi
if [[ "${EXECUTE}" == "1" \
  && "${ACTION}" != "validate" \
  && -z "${INVENTORY_REPORT}" ]]; then
  echo "--inventory-report is required for executed stage and promotion." >&2
  exit 1
fi
if [[ -n "${INVENTORY_REPORT}" && "${INVENTORY_REPORT}" != /* ]]; then
  INVENTORY_REPORT="${REPO_ROOT}/${INVENTORY_REPORT}"
fi
if [[ "${ACTION}" == "promote" ]]; then
  if [[ -z "${HOSTING_EVIDENCE}" \
    || -z "${ACTIVE_MAPPING_EVIDENCE}" \
    || -z "${LIVE_REPORT}" \
    || -z "${BROWSER_REPORT}" \
    || -z "${SAMPLE_PLAN}" \
    || -z "${SELECTION}" \
    || -z "${BUILD_REPORT}" \
    || -z "${EXPECTED_DEPLOYMENT_COMMIT}" \
    || -z "${EXPECTED_WORKFLOW_RUN_ID}" \
    || -z "${EXPECTED_WORKFLOW_RUN_ATTEMPT}" ]]; then
    echo "Promotion requires Hosting, live, browser, sample-plan, selection, build-report, deployment-commit, and workflow-run evidence." >&2
    exit 1
  fi
  for evidence_var in \
    HOSTING_EVIDENCE \
    ACTIVE_MAPPING_EVIDENCE \
    ACTIVE_RELEASE_CONTRACT \
    FORM_CATALOG_DATA \
    LIVE_REPORT \
    BROWSER_REPORT \
    SAMPLE_PLAN \
    SELECTION \
    BUILD_REPORT; do
    evidence_path="${!evidence_var}"
    if [[ "${evidence_path}" != /* ]]; then
      printf -v "${evidence_var}" '%s/%s' "${REPO_ROOT}" "${evidence_path}"
    fi
  done
elif [[ -n "${HOSTING_EVIDENCE}" \
  || -n "${ACTIVE_MAPPING_EVIDENCE}" \
  || -n "${LIVE_REPORT}" \
  || -n "${BROWSER_REPORT}" \
  || -n "${SAMPLE_PLAN}" \
  || -n "${SELECTION}" \
  || -n "${BUILD_REPORT}" \
  || -n "${EXPECTED_DEPLOYMENT_COMMIT}" \
  || -n "${EXPECTED_WORKFLOW_RUN_ID}" \
  || -n "${EXPECTED_WORKFLOW_RUN_ATTEMPT}" ]]; then
  echo "Promotion evidence arguments are only valid with --action promote." >&2
  exit 1
fi
if [[ -n "${EXTERNAL_PRODUCTION_LOCK_STATE}" \
  || -n "${EXTERNAL_PRODUCTION_LOCK_OWNER}" ]]; then
  if [[ -z "${EXTERNAL_PRODUCTION_LOCK_STATE}" \
    || -z "${EXTERNAL_PRODUCTION_LOCK_OWNER}" ]]; then
    echo "External production lock state and owner must be supplied together." >&2
    exit 1
  fi
  if [[ "${ACTION}" != "promote" || "${EXECUTE}" != "1" ]]; then
    echo "An external production lock is only valid for executed promotion." >&2
    exit 1
  fi
  if [[ "${EXTERNAL_PRODUCTION_LOCK_STATE}" != /* ]]; then
    EXTERNAL_PRODUCTION_LOCK_STATE="${REPO_ROOT}/${EXTERNAL_PRODUCTION_LOCK_STATE}"
  fi
fi

if [[ "${ACTION}" != "validate" ]]; then
  if [[ ! "${BUCKET_URL}" =~ ^gs://[a-z0-9][a-z0-9._-]+$ ]]; then
    echo "--bucket must be a bucket-only gs:// URL." >&2
    exit 1
  fi
  if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,61}[a-z0-9]$ ]]; then
    echo "--project has an invalid Google Cloud project ID." >&2
    exit 1
  fi
  if [[ "${ACTION}" == "promote" && "${PROJECT_ID}" != "dullypdf" ]]; then
    echo "Catalog pointer promotion is pinned to production project dullypdf." >&2
    exit 1
  fi
  if [[ "${ACTION}" == "promote" \
    && "${BUCKET_URL}" != "gs://dullypdf-form-catalog-assets-east4" ]]; then
    echo "Catalog pointer promotion is pinned to the production catalog bucket." >&2
    exit 1
  fi
  if [[ "${ACTION}" == "promote" \
    && "${ACTIVE_OBJECT}" != "catalog-release-state/active.json" ]]; then
    echo "Catalog pointer promotion is pinned to the production active pointer." >&2
    exit 1
  fi
  if [[ ! "${ACTIVE_OBJECT}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] \
    || [[ "${ACTIVE_OBJECT}" == *".."* ]] \
    || [[ "${ACTIVE_OBJECT}" == /* ]]; then
    echo "--active-object must be a normalized relative object path." >&2
    exit 1
  fi
fi

TMP_VALIDATION_JSON="$(mktemp)"
TMP_VALIDATED_PLAN="$(mktemp)"
TMP_UPLOAD_PLAN="$(mktemp)"
TMP_GCS_OBJECT_PLAN="$(mktemp)"
TMP_SNAPSHOT_ROOT="$(mktemp -d)"
TMP_GCS_INVENTORY_REPORT="${TMP_SNAPSHOT_ROOT}/gcs-inventory-report.json"
TMP_MANIFEST_SNAPSHOT="$(mktemp)"
TMP_FROZEN_LEDGER_SNAPSHOT="$(mktemp)"
TMP_REMOTE_POINTER="$(mktemp)"
TMP_NEW_POINTER="$(mktemp)"
TMP_LIVE_HOSTING_SNAPSHOT="$(mktemp)"
TMP_PRODUCTION_LOCK_STATE="$(mktemp)"
PRODUCTION_LOCK_OWNER=""
PRODUCTION_LOCK_ACQUIRED=0
PRODUCTION_LOCK_EXTERNAL=0
PRODUCTION_LOCK_STATE_FILE="${TMP_PRODUCTION_LOCK_STATE}"
if [[ -n "${EXTERNAL_PRODUCTION_LOCK_STATE}" ]]; then
  PRODUCTION_LOCK_EXTERNAL=1
  PRODUCTION_LOCK_STATE_FILE="${EXTERNAL_PRODUCTION_LOCK_STATE}"
fi

release_production_lock() {
  if [[ "${PRODUCTION_LOCK_ACQUIRED}" != "1" ]]; then
    return 0
  fi
  if [[ "${PRODUCTION_LOCK_EXTERNAL}" == "1" ]]; then
    echo "The caller retains ownership of the shared production deployment lock."
    PRODUCTION_LOCK_ACQUIRED=0
    return 0
  fi
  if ! bash "${PRODUCTION_LOCK}" \
    --action release \
    --bucket "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --owner "${PRODUCTION_LOCK_OWNER}" \
    --state-file "${PRODUCTION_LOCK_STATE_FILE}"; then
    return 1
  fi
  PRODUCTION_LOCK_ACQUIRED=0
}

cleanup() {
  if [[ "${PRODUCTION_LOCK_ACQUIRED}" == "1" ]]; then
    release_production_lock || {
      echo "Failed to release the shared production deployment lock during cleanup." >&2
    }
  fi
  rm -f \
    "${TMP_VALIDATION_JSON}" \
    "${TMP_VALIDATED_PLAN}" \
    "${TMP_UPLOAD_PLAN}" \
    "${TMP_GCS_OBJECT_PLAN}" \
    "${TMP_MANIFEST_SNAPSHOT}" \
    "${TMP_FROZEN_LEDGER_SNAPSHOT}" \
    "${TMP_REMOTE_POINTER}" \
    "${TMP_NEW_POINTER}" \
    "${TMP_LIVE_HOSTING_SNAPSHOT}" \
    "${TMP_PRODUCTION_LOCK_STATE}" || true
  rm -rf "${TMP_SNAPSHOT_ROOT}" || true
}
trap cleanup EXIT

cp -- "${MANIFEST}" "${TMP_MANIFEST_SNAPSHOT}"
cp -- "${FROZEN_LEDGER_MANIFEST}" "${TMP_FROZEN_LEDGER_SNAPSHOT}"
chmod 0444 "${TMP_MANIFEST_SNAPSHOT}" "${TMP_FROZEN_LEDGER_SNAPSHOT}"
MANIFEST_INPUT="${MANIFEST}"
FROZEN_LEDGER_MANIFEST_INPUT="${FROZEN_LEDGER_MANIFEST}"
MANIFEST="${TMP_MANIFEST_SNAPSHOT}"
FROZEN_LEDGER_MANIFEST="${TMP_FROZEN_LEDGER_SNAPSHOT}"

VALIDATOR_ARGS=(
  --manifest "${MANIFEST}"
  --frozen-ledger-manifest "${FROZEN_LEDGER_MANIFEST}"
  --asset-root "${ASSET_ROOT}"
  --max-forms "${MAX_FORMS}"
)
if [[ "${ACTION}" == "promote" ]]; then
  VALIDATOR_ARGS+=(
    --hosting-evidence "${HOSTING_EVIDENCE}"
    --active-mapping-evidence "${ACTIVE_MAPPING_EVIDENCE}"
    --active-release-contract "${ACTIVE_RELEASE_CONTRACT}"
    --form-catalog-data "${FORM_CATALOG_DATA}"
    --live-report "${LIVE_REPORT}"
    --browser-report "${BROWSER_REPORT}"
    --sample-plan "${SAMPLE_PLAN}"
    --selection "${SELECTION}"
    --build-report "${BUILD_REPORT}"
    --expected-deployment-commit "${EXPECTED_DEPLOYMENT_COMMIT}"
    --expected-workflow-run-id "${EXPECTED_WORKFLOW_RUN_ID}"
    --expected-workflow-run-attempt "${EXPECTED_WORKFLOW_RUN_ATTEMPT}"
  )
  if [[ "${EXECUTE}" == "1" ]]; then
    # Evidence inputs may be private controller snapshots. The validator reads
    # those exact bytes while comparing them with the canonical paths in Git
    # HEAD, so arbitrary caller-controlled mappings cannot authorize promotion.
    VALIDATOR_ARGS+=(--require-committed-active-mapping)
  fi
fi

# One validator pass binds the manifest, exact local bytes, and any promotion
# evidence. All later orchestration reads this frozen result rather than
# reopening mutable input JSON files.
python3 "${VALIDATOR}" "${VALIDATOR_ARGS[@]}" --format json > "${TMP_VALIDATION_JSON}"
python3 - "${TMP_VALIDATION_JSON}" > "${TMP_VALIDATED_PLAN}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
for asset in payload["assets"]:
    print(
        "\t".join(
            (
                asset["sourcePath"],
                asset["objectPath"],
                asset["contentType"],
                asset["sha256"],
                str(asset["bytes"]),
            )
        )
    )
PY

validation_field() {
  python3 - "${TMP_VALIDATION_JSON}" "$1" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
value = payload
for part in sys.argv[2].split("."):
    value = value[part]
print("" if value is None else value)
PY
}

RELEASE_ID="$(validation_field releaseId)"
SOURCE_COMMIT="$(validation_field sourceCommit)"
PREVIOUS_RELEASE_ID="$(validation_field previousReleaseId)"
MANIFEST_OBJECT="$(validation_field manifestObjectPath)"
MANIFEST_SHA256="$(validation_field manifestSha256)"
MANIFEST_BYTES="$(validation_field manifestBytes)"
FROZEN_DIGEST="$(validation_field frozenLedgerAttestation.frozenDigest)"
FROZEN_ATTESTATION_SHA256="$(validation_field frozenLedgerAttestation.sha256)"
FROZEN_ATTESTATION_BYTES="$(validation_field frozenLedgerAttestation.bytes)"
FROZEN_ATTESTATION_OBJECT="releases/${RELEASE_ID}/frozen-ledger-manifest.json"
HOSTING_VERSION=""
ROLLBACK_HOSTING_VERSION=""
HOSTING_EVIDENCE_SHA256=""
LIVE_REPORT_SHA256=""
BROWSER_REPORT_SHA256=""
SAMPLE_PLAN_SHA256=""
ACTIVE_MAPPING_EVIDENCE_SHA256=""
ACTIVE_CONTRACT_SHA256=""
FORM_CATALOG_DATA_SHA256=""
ACTIVE_MAPPING_DIGEST=""
MANIFEST_MAPPING_DIGEST=""
ACTIVE_REPLACEMENT_COUNT=""
CURRENT_RELEASE_REPLACEMENT_COUNT=""
HOSTING_PROJECT_ID=""
HOSTING_SITE=""
HOSTING_DEPLOYMENT_COMMIT=""
HOSTING_WORKFLOW_RUN_ID=""
HOSTING_WORKFLOW_RUN_ATTEMPT=""
HOSTING_RELEASE_NAME=""
HOSTING_DEPLOYED_AT=""
if [[ "${ACTION}" == "promote" ]]; then
  HOSTING_VERSION="$(validation_field promotionEvidence.hostingVersion)"
  ROLLBACK_HOSTING_VERSION="$(validation_field promotionEvidence.rollbackHostingVersion)"
  HOSTING_EVIDENCE_SHA256="$(validation_field promotionEvidence.hostingEvidenceSha256)"
  LIVE_REPORT_SHA256="$(validation_field promotionEvidence.liveReportSha256)"
  BROWSER_REPORT_SHA256="$(validation_field promotionEvidence.browserReportSha256)"
  SAMPLE_PLAN_SHA256="$(validation_field promotionEvidence.samplePlanSha256)"
  ACTIVE_MAPPING_EVIDENCE_SHA256="$(validation_field promotionEvidence.activeMappingEvidenceSha256)"
  ACTIVE_CONTRACT_SHA256="$(validation_field promotionEvidence.activeContractSha256)"
  FORM_CATALOG_DATA_SHA256="$(validation_field promotionEvidence.formCatalogDataSha256)"
  ACTIVE_MAPPING_DIGEST="$(validation_field promotionEvidence.activeMappingDigest)"
  MANIFEST_MAPPING_DIGEST="$(validation_field promotionEvidence.manifestMappingDigest)"
  ACTIVE_REPLACEMENT_COUNT="$(validation_field promotionEvidence.activeReplacementCount)"
  CURRENT_RELEASE_REPLACEMENT_COUNT="$(validation_field promotionEvidence.currentReleaseReplacementCount)"
  HOSTING_PROJECT_ID="$(validation_field promotionEvidence.projectId)"
  HOSTING_SITE="$(validation_field promotionEvidence.site)"
  HOSTING_DEPLOYMENT_COMMIT="$(validation_field promotionEvidence.deploymentCommit)"
  HOSTING_WORKFLOW_RUN_ID="$(validation_field promotionEvidence.workflowRunId)"
  HOSTING_WORKFLOW_RUN_ATTEMPT="$(validation_field promotionEvidence.workflowRunAttempt)"
  HOSTING_RELEASE_NAME="$(validation_field promotionEvidence.hostingReleaseName)"
  HOSTING_DEPLOYED_AT="$(validation_field promotionEvidence.deployedAt)"
fi

if [[ -n "${EXPECTED_COMMIT}" && "${EXPECTED_COMMIT,,}" != "${SOURCE_COMMIT}" ]]; then
  echo "Manifest sourceCommit ${SOURCE_COMMIT} does not match --expected-commit ${EXPECTED_COMMIT}." >&2
  exit 1
fi
if [[ "${EXECUTE}" == "1" && "${ACTION}" != "validate" && -z "${EXPECTED_COMMIT}" ]]; then
  echo "--expected-commit is required with --execute." >&2
  exit 1
fi

ASSET_COUNT="$(validation_field assetCount)"
echo "Catalog release ${RELEASE_ID}: action=${ACTION} assets=${ASSET_COUNT} sourceCommit=${SOURCE_COMMIT}"
echo "Frozen ledger attestation: frozenDigest=${FROZEN_DIGEST} sha256=${FROZEN_ATTESTATION_SHA256}"
if [[ "${EXECUTE}" == "0" ]]; then
  echo "Dry run only. Add --execute after reviewing this plan."
fi

if [[ "${ACTION}" == "validate" ]]; then
  echo "Local release validation passed."
  exit 0
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "openssl is required to bind uploads to provider-verified MD5 checksums." >&2
  exit 1
fi

file_md5_base64() {
  openssl dgst -md5 -binary "$1" | base64 | tr -d '\n'
}

# Copy each validated asset into a private release-scoped snapshot and verify
# that snapshot against the manifest. Uploads never reopen the mutable source
# paths, eliminating the validation-to-upload race.
while IFS=$'\t' read -r source_path object_path content_type sha256 byte_count; do
  [[ -z "${source_path}" ]] && continue
  snapshot_path="${TMP_SNAPSHOT_ROOT}/${object_path}"
  mkdir -p "$(dirname "${snapshot_path}")"
  cp -- "${source_path}" "${snapshot_path}"
  snapshot_bytes="$(wc -c < "${snapshot_path}" | tr -d ' ')"
  snapshot_sha256="$(sha256sum "${snapshot_path}" | awk '{print $1}')"
  if [[ "${snapshot_bytes}" != "${byte_count}" || "${snapshot_sha256}" != "${sha256}" ]]; then
    echo "Immutable upload snapshot no longer matches the manifest: ${object_path}" >&2
    exit 1
  fi
  chmod 0444 "${snapshot_path}"
  snapshot_md5="$(file_md5_base64 "${snapshot_path}")"
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${snapshot_path}" \
    "${object_path}" \
    "${content_type}" \
    "${sha256}" \
    "${byte_count}" \
    "${snapshot_md5}" >> "${TMP_UPLOAD_PLAN}"
done < "${TMP_VALIDATED_PLAN}"

MANIFEST_MD5="$(file_md5_base64 "${MANIFEST}")"
FROZEN_ATTESTATION_MD5="$(file_md5_base64 "${FROZEN_LEDGER_MANIFEST}")"
GCS_OBJECT_COUNT="$((ASSET_COUNT + 2))"
GCS_PREFIX="releases/${RELEASE_ID}/"
GCS_EXPECTED_INVENTORY_DIGEST="$(
  python3 - \
    "${TMP_UPLOAD_PLAN}" \
    "${MANIFEST}" \
    "${FROZEN_LEDGER_MANIFEST}" \
    "${TMP_GCS_OBJECT_PLAN}" \
    "${PROJECT_ID}" \
    "${BUCKET_URL#gs://}" \
    "${GCS_PREFIX}" \
    "${RELEASE_ID}" \
    "${SOURCE_COMMIT}" \
    "${MANIFEST_OBJECT}" \
    "${MANIFEST_SHA256}" \
    "${MANIFEST_BYTES}" \
    "${MANIFEST_MD5}" \
    "${FROZEN_ATTESTATION_OBJECT}" \
    "${FROZEN_ATTESTATION_SHA256}" \
    "${FROZEN_ATTESTATION_BYTES}" \
    "${FROZEN_ATTESTATION_MD5}" \
    "${FROZEN_DIGEST}" \
    "${GCS_OBJECT_COUNT}" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

(
    upload_plan_path,
    manifest_path,
    frozen_attestation_path,
    output_path,
    project_id,
    bucket,
    prefix,
    release_id,
    source_commit,
    manifest_object,
    manifest_sha256,
    manifest_bytes,
    manifest_md5,
    frozen_object,
    frozen_sha256,
    frozen_bytes,
    frozen_md5,
    frozen_digest,
    expected_count,
) = sys.argv[1:]

cache_control = "public,max-age=31536000,immutable"
objects = []


def add_object(
    *,
    source_path,
    object_path,
    byte_count,
    sha256,
    md5_base64,
    content_type,
    kind,
    extra_metadata=None,
):
    metadata = {
        "catalog_asset_kind": kind,
        "catalog_release_id": release_id,
        "catalog_sha256": sha256,
        "catalog_source_commit": source_commit,
    }
    if extra_metadata:
        metadata.update(extra_metadata)
    objects.append(
        {
            "objectPath": object_path,
            "sourcePath": str(Path(source_path).resolve(strict=True)),
            "bytes": int(byte_count),
            "sha256": sha256,
            "md5Base64": md5_base64,
            "contentType": content_type,
            "cacheControl": cache_control,
            "customMetadata": metadata,
        }
    )


for line_number, line in enumerate(
    Path(upload_plan_path).read_text(encoding="utf-8").splitlines(),
    start=1,
):
    parts = line.split("\t")
    if len(parts) != 6:
        raise SystemExit(
            f"Private upload plan line {line_number} is not an exact six-column row"
        )
    source_path, object_path, content_type, sha256, byte_count, md5_base64 = parts
    if content_type == "application/pdf":
        kind = "pdf"
    elif content_type == "image/webp":
        kind = "thumbnail"
    else:
        raise SystemExit(
            f"Private upload plan line {line_number} has an unsupported content type"
        )
    add_object(
        source_path=source_path,
        object_path=object_path,
        byte_count=byte_count,
        sha256=sha256,
        md5_base64=md5_base64,
        content_type=content_type,
        kind=kind,
    )

add_object(
    source_path=manifest_path,
    object_path=manifest_object,
    byte_count=manifest_bytes,
    sha256=manifest_sha256,
    md5_base64=manifest_md5,
    content_type="application/json",
    kind="release_manifest",
)
add_object(
    source_path=frozen_attestation_path,
    object_path=frozen_object,
    byte_count=frozen_bytes,
    sha256=frozen_sha256,
    md5_base64=frozen_md5,
    content_type="application/json",
    kind="frozen_ledger_attestation",
    extra_metadata={"catalog_frozen_digest": frozen_digest},
)

objects.sort(key=lambda item: item["objectPath"])
paths = [item["objectPath"] for item in objects]
if len(objects) != int(expected_count):
    raise SystemExit(
        f"Expected-object plan has {len(objects)} objects, expected {expected_count}"
    )
if len(paths) != len(set(paths)):
    raise SystemExit("Expected-object plan contains duplicate object paths")
if any(not path.startswith(prefix) for path in paths):
    raise SystemExit("Expected-object plan contains an object outside its release prefix")

plan = {
    "schemaVersion": 1,
    "reportType": "form-catalog-gcs-expected-object-plan",
    "projectId": project_id,
    "bucket": bucket,
    "prefix": prefix,
    "objects": objects,
}
Path(output_path).write_text(
    json.dumps(plan, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)

inventory_objects = [
    {
        key: item[key]
        for key in (
            "objectPath",
            "bytes",
            "sha256",
            "md5Base64",
            "contentType",
            "cacheControl",
            "customMetadata",
        )
    }
    for item in objects
]
identity = {
    "projectId": project_id,
    "bucket": bucket,
    "prefix": prefix,
    "objects": inventory_objects,
}
encoded = json.dumps(
    identity,
    ensure_ascii=False,
    allow_nan=False,
    sort_keys=True,
    separators=(",", ":"),
).encode("utf-8")
print(hashlib.sha256(encoded).hexdigest())
PY
)"

if [[ "${EXECUTE}" == "1" ]]; then
  if [[ ! -x "${FORM_CATALOG_PYTHON_BIN}" ]]; then
    echo "The pinned form-catalog interpreter is not executable: ${FORM_CATALOG_PYTHON_BIN}" >&2
    exit 1
  fi
  if [[ ! -f "${GCS_TRANSPORT}" ]]; then
    echo "The form-catalog GCS transport wrapper is missing: ${GCS_TRANSPORT}" >&2
    exit 1
  fi
  GCS_PREFLIGHT_SENTINEL="$(
    "${FORM_CATALOG_PYTHON_BIN}" - <<'PY'
try:
    import google.auth
    from google.cloud import storage

    if storage.__version__ != "3.9.0":
        raise RuntimeError("unexpected storage SDK version")
    google.auth.default()
except Exception:
    raise SystemExit("Pinned SDK or Application Default Credentials unavailable")
print("dullypdf-gcs-preflight-ok")
PY
  )" || {
    echo "The pinned SDK or Application Default Credentials preflight failed." >&2
    exit 1
  }
  if [[ "${GCS_PREFLIGHT_SENTINEL}" != "dullypdf-gcs-preflight-ok" ]]; then
    echo "The form-catalog interpreter failed its exact preflight sentinel." >&2
    exit 1
  fi
  if [[ "${ACTION}" == "promote" ]]; then
    if ! command -v gcloud >/dev/null 2>&1; then
      echo "gcloud is required for executed promotion." >&2
      exit 1
    fi
    gcloud storage buckets describe "${BUCKET_URL}" \
      --project "${PROJECT_ID}" \
      --format='value(name)' >/dev/null
  fi
fi

verify_inventory_report_destination() {
  if [[ -z "${INVENTORY_REPORT}" ]]; then
    return 0
  fi
  local protected_paths=(
    "${MANIFEST_INPUT}"
    "${FROZEN_LEDGER_MANIFEST_INPUT}"
    "${TMP_GCS_OBJECT_PLAN}"
  )
  if [[ "${ACTION}" == "promote" ]]; then
    protected_paths+=(
      "${HOSTING_EVIDENCE}"
      "${ACTIVE_MAPPING_EVIDENCE}"
      "${ACTIVE_RELEASE_CONTRACT}"
      "${FORM_CATALOG_DATA}"
      "${LIVE_REPORT}"
      "${BROWSER_REPORT}"
      "${SAMPLE_PLAN}"
      "${SELECTION}"
      "${BUILD_REPORT}"
      "${EXTERNAL_PRODUCTION_LOCK_STATE}"
    )
  fi
  python3 - \
    "${INVENTORY_REPORT}" \
    "${TMP_VALIDATED_PLAN}" \
    "${protected_paths[@]}" <<'PY'
import sys
from pathlib import Path

report_path = Path(sys.argv[1]).resolve(strict=False)
validated_plan_path = Path(sys.argv[2])
protected = {
    Path(value).resolve(strict=False)
    for value in sys.argv[3:]
    if value
}
for line in validated_plan_path.read_text(encoding="utf-8").splitlines():
    if line:
        protected.add(Path(line.split("\t", 1)[0]).resolve(strict=False))
if report_path in protected:
    raise SystemExit(
        "--inventory-report cannot overwrite release inputs, evidence, lock state, "
        "or source assets"
    )
PY
}

run_gcs_transport() {
  local operation="$1"
  local output_label="${INVENTORY_REPORT:-<required-with---execute>}"
  if [[ "${EXECUTE}" == "0" ]]; then
    echo "+ GCS ${operation}: objects=${GCS_OBJECT_COUNT} prefix=${GCS_PREFIX} expectedInventoryDigest=${GCS_EXPECTED_INVENTORY_DIGEST}"
    echo "+ boundedWorkers=${GCS_WORKERS} pageSize=${GCS_PAGE_SIZE} timeoutSeconds=${GCS_TIMEOUT_SECONDS} inventoryReport=${output_label}"
    return 0
  fi

  verify_inventory_report_destination
  mkdir -p "$(dirname "${INVENTORY_REPORT}")"
  if [[ -e "${TMP_GCS_INVENTORY_REPORT}" ]]; then
    echo "Private GCS inventory output unexpectedly exists before transport." >&2
    return 1
  fi
  "${FORM_CATALOG_PYTHON_BIN}" "${GCS_TRANSPORT}" \
    --action "${operation}" \
    --plan "${TMP_GCS_OBJECT_PLAN}" \
    --output "${TMP_GCS_INVENTORY_REPORT}" \
    --max-workers "${GCS_WORKERS}" \
    --page-size "${GCS_PAGE_SIZE}" \
    --timeout-seconds "${GCS_TIMEOUT_SECONDS}"
  if [[ ! -f "${TMP_GCS_INVENTORY_REPORT}" ]]; then
    echo "GCS transport returned without producing fresh private inventory evidence." >&2
    return 1
  fi

  python3 - \
    "${TMP_GCS_INVENTORY_REPORT}" \
    "${operation}" \
    "${PROJECT_ID}" \
    "${BUCKET_URL#gs://}" \
    "${GCS_PREFIX}" \
    "${GCS_OBJECT_COUNT}" \
    "${GCS_EXPECTED_INVENTORY_DIGEST}" <<'PY'
import hashlib
import json
import re
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
expected = {
    "schemaVersion": 1,
    "reportType": "form-catalog-gcs-inventory",
    "producer": "google-cloud-storage",
    "producerVersion": "3.9.0",
    "operation": sys.argv[2],
    "projectId": sys.argv[3],
    "bucket": sys.argv[4],
    "prefix": sys.argv[5],
    "objectCount": int(sys.argv[6]),
    "expectedInventoryDigest": sys.argv[7],
    "ok": True,
}
for key, value in expected.items():
    if payload.get(key) != value:
        raise SystemExit(f"Persisted GCS inventory report {key} mismatch")
objects = payload.get("objects")
if not isinstance(objects, list) or len(objects) != expected["objectCount"]:
    raise SystemExit("Persisted GCS inventory report object evidence is incomplete")
inventory_digest = str(payload.get("inventoryDigest", ""))
if not re.fullmatch(r"[0-9a-f]{64}", inventory_digest):
    raise SystemExit("Persisted GCS inventory report has no canonical inventory digest")
inventory_identity = {
    "projectId": expected["projectId"],
    "bucket": expected["bucket"],
    "prefix": expected["prefix"],
    "objects": objects,
}
recomputed_digest = hashlib.sha256(
    json.dumps(
        inventory_identity,
        ensure_ascii=False,
        allow_nan=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
).hexdigest()
if inventory_digest != recomputed_digest:
    raise SystemExit("Persisted GCS inventory report digest does not match its objects")
PY
  python3 - "${TMP_GCS_INVENTORY_REPORT}" "${INVENTORY_REPORT}" <<'PY'
import os
import shutil
import sys
import tempfile
from pathlib import Path

source = Path(sys.argv[1])
destination = Path(sys.argv[2]).resolve(strict=False)
descriptor, temporary_name = tempfile.mkstemp(
    prefix=f".{destination.name}.",
    suffix=".tmp",
    dir=destination.parent,
)
temporary_path = Path(temporary_name)
try:
    with source.open("rb") as input_file, os.fdopen(descriptor, "wb") as output:
        descriptor = -1
        shutil.copyfileobj(input_file, output)
        output.flush()
        os.fsync(output.fileno())
    os.replace(temporary_path, destination)
    directory_flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
    directory_descriptor = os.open(destination.parent, directory_flags)
    try:
        os.fsync(directory_descriptor)
    finally:
        os.close(directory_descriptor)
except BaseException:
    if descriptor >= 0:
        os.close(descriptor)
    try:
        temporary_path.unlink(missing_ok=True)
    except OSError:
        pass
    raise
PY
  echo "GCS ${operation} inventory report sha256=$(sha256sum "${INVENTORY_REPORT}" | awk '{print $1}')"
}

if [[ "${ACTION}" == "stage" ]]; then
  run_gcs_transport stage
  if [[ "${EXECUTE}" == "1" ]]; then
    echo "Release ${RELEASE_ID} staged without changing the active release pointer."
  else
    echo "Release ${RELEASE_ID} stage dry run passed; no cloud objects were created."
  fi
  exit 0
fi

ACTIVE_URL="${BUCKET_URL}/${ACTIVE_OBJECT}"
if [[ "${EXECUTE}" == "0" ]]; then
  run_gcs_transport verify
  echo "+ require hostingVersion=${HOSTING_VERSION} rollbackHostingVersion=${ROLLBACK_HOSTING_VERSION}"
  echo "+ require exact deterministic sample, release-bound HTTP, and browser reports"
  echo "+ acquire the shared production Hosting deployment lock"
  echo "+ re-query ${HOSTING_SITE} live Hosting and require ${HOSTING_VERSION} immediately before pointer CAS"
  echo "+ compare ${ACTIVE_URL} releaseId with previousReleaseId=${PREVIOUS_RELEASE_ID:-<none>}"
  echo "+ conditionally update ${ACTIVE_URL} using its observed object generation"
  echo "Promotion dry run passed. The active pointer was not changed."
  exit 0
fi

# If a prior invocation completed the pointer CAS but lost the lock-release
# response, recover only the exact lock generation recorded in that fully
# matching active pointer. This keeps post-CAS retries idempotent without ever
# deleting a lock owned by a later controlled deploy.
if [[ "${PRODUCTION_LOCK_EXTERNAL}" == "0" ]] \
  && gcloud storage cp "${ACTIVE_URL}" "${TMP_REMOTE_POINTER}" \
  --project "${PROJECT_ID}" >/dev/null 2>&1; then
  RECOVERY_LOCK_IDENTITY=""
  if RECOVERY_LOCK_IDENTITY="$(
    python3 - \
      "${TMP_REMOTE_POINTER}" \
      "${RELEASE_ID}" \
      "${SOURCE_COMMIT}" \
      "${PREVIOUS_RELEASE_ID}" \
      "${MANIFEST_OBJECT}" \
      "${MANIFEST_SHA256}" \
      "${FROZEN_ATTESTATION_OBJECT}" \
      "${FROZEN_ATTESTATION_SHA256}" \
      "${FROZEN_DIGEST}" \
      "${HOSTING_VERSION}" \
      "${ROLLBACK_HOSTING_VERSION}" \
      "${HOSTING_EVIDENCE_SHA256}" \
      "${LIVE_REPORT_SHA256}" \
      "${BROWSER_REPORT_SHA256}" \
      "${SAMPLE_PLAN_SHA256}" \
      "${ACTIVE_MAPPING_EVIDENCE_SHA256}" \
      "${ACTIVE_CONTRACT_SHA256}" \
      "${FORM_CATALOG_DATA_SHA256}" \
      "${ACTIVE_MAPPING_DIGEST}" \
      "${MANIFEST_MAPPING_DIGEST}" \
      "${ACTIVE_REPLACEMENT_COUNT}" \
      "${CURRENT_RELEASE_REPLACEMENT_COUNT}" \
      "${HOSTING_PROJECT_ID}" \
      "${HOSTING_SITE}" \
      "${HOSTING_DEPLOYMENT_COMMIT}" \
      "${HOSTING_WORKFLOW_RUN_ID}" \
      "${HOSTING_WORKFLOW_RUN_ATTEMPT}" \
      "${HOSTING_RELEASE_NAME}" \
      "${HOSTING_DEPLOYED_AT}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("releaseId") != sys.argv[2]:
    raise SystemExit(3)
keys = (
    "releaseId",
    "sourceCommit",
    "previousReleaseId",
    "manifestObject",
    "manifestSha256",
    "frozenAttestationObject",
    "frozenAttestationSha256",
    "frozenDigest",
    "hostingVersion",
    "rollbackHostingVersion",
    "hostingEvidenceSha256",
    "liveReportSha256",
    "browserReportSha256",
    "samplePlanSha256",
    "activeMappingEvidenceSha256",
    "activeContractSha256",
    "formCatalogDataSha256",
    "activeMappingDigest",
    "manifestMappingDigest",
    "activeReplacementCount",
    "currentReleaseReplacementCount",
    "hostingProjectId",
    "hostingSite",
    "hostingDeploymentCommit",
    "hostingWorkflowRunId",
    "hostingWorkflowRunAttempt",
    "hostingEvidenceReleaseName",
    "hostingEvidenceReleaseTime",
)
expected_values = list(sys.argv[2:])
expected_values[2] = expected_values[2] or None
for key, expected in zip(keys, expected_values):
    if key in {"activeReplacementCount", "currentReleaseReplacementCount"}:
        expected = int(expected)
    if payload.get(key) != expected:
        raise SystemExit(
            f"Already-active catalog pointer {key} does not match this promotion"
        )
owner = payload.get("promotionLockOwner")
generation = payload.get("promotionLockGeneration")
if not isinstance(owner, str) or not owner or not isinstance(generation, str) or not generation:
    raise SystemExit("Already-active pointer has no recoverable promotion lock identity")
print(f"{owner}\t{generation}")
PY
  )"; then
    IFS=$'\t' read -r RECOVERY_LOCK_OWNER RECOVERY_LOCK_GENERATION \
      <<< "${RECOVERY_LOCK_IDENTITY}"
    REMOTE_LOCK_GENERATION="$(
      gcloud storage objects describe \
        "${BUCKET_URL}/catalog-release-state/production-deployment.lock" \
        --project "${PROJECT_ID}" \
        --format='value(generation)' 2>/dev/null
    )" || REMOTE_LOCK_GENERATION=""
    if [[ "${REMOTE_LOCK_GENERATION}" == "${RECOVERY_LOCK_GENERATION}" ]]; then
      python3 - \
        "${TMP_PRODUCTION_LOCK_STATE}" \
        "${BUCKET_URL}/catalog-release-state/production-deployment.lock" \
        "${RECOVERY_LOCK_OWNER}" \
        "${RECOVERY_LOCK_GENERATION}" <<'PY'
import json
import sys
from pathlib import Path

Path(sys.argv[1]).write_text(
    json.dumps(
        {
            "schemaVersion": 1,
            "objectUrl": sys.argv[2],
            "owner": sys.argv[3],
            "generation": sys.argv[4],
        },
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
PY
      PRODUCTION_LOCK_OWNER="${RECOVERY_LOCK_OWNER}"
      PRODUCTION_LOCK_ACQUIRED=1
      release_production_lock
      echo "Recovered the exact post-CAS production lock from the active pointer."
    fi
  else
    recovery_status=$?
    if [[ "${recovery_status}" != "3" ]]; then
      echo "Could not validate the already-active pointer for lock recovery." >&2
      exit "${recovery_status}"
    fi
  fi
fi

if [[ "${PRODUCTION_LOCK_EXTERNAL}" == "1" ]]; then
  PRODUCTION_LOCK_OWNER="${EXTERNAL_PRODUCTION_LOCK_OWNER}"
  bash "${PRODUCTION_LOCK}" \
    --action verify \
    --bucket "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --owner "${PRODUCTION_LOCK_OWNER}" \
    --state-file "${PRODUCTION_LOCK_STATE_FILE}"
else
  PRODUCTION_LOCK_OWNER="catalog-promote:${RELEASE_ID}:$$:$(date +%s)"
  bash "${PRODUCTION_LOCK}" \
    --action acquire \
    --bucket "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --owner "${PRODUCTION_LOCK_OWNER}" \
    --state-file "${PRODUCTION_LOCK_STATE_FILE}"
  PRODUCTION_LOCK_ACQUIRED=1
fi
PRODUCTION_LOCK_GENERATION="$(
  python3 - "${PRODUCTION_LOCK_STATE_FILE}" <<'PY'
import json
import sys
from pathlib import Path

print(json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["generation"])
PY
)"

ACTIVE_GENERATION=""
CURRENT_RELEASE_ID=""
ALREADY_PROMOTED=0
if ACTIVE_GENERATION="$(
  gcloud storage objects describe "${ACTIVE_URL}" \
    --project "${PROJECT_ID}" \
    --format='value(generation)' 2>/dev/null
)"; then
  gcloud storage cp "${ACTIVE_URL}" "${TMP_REMOTE_POINTER}" \
    --project "${PROJECT_ID}" >/dev/null
  CURRENT_RELEASE_ID="$(
    python3 - "${TMP_REMOTE_POINTER}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
release_id = payload.get("releaseId")
if not isinstance(release_id, str) or not release_id:
    raise SystemExit("Active catalog release pointer has no releaseId")
print(release_id)
PY
  )"
  if [[ "${CURRENT_RELEASE_ID}" == "${RELEASE_ID}" ]]; then
    python3 - \
      "${TMP_REMOTE_POINTER}" \
      "${RELEASE_ID}" \
      "${SOURCE_COMMIT}" \
      "${PREVIOUS_RELEASE_ID}" \
      "${MANIFEST_OBJECT}" \
      "${MANIFEST_SHA256}" \
      "${FROZEN_ATTESTATION_OBJECT}" \
      "${FROZEN_ATTESTATION_SHA256}" \
      "${FROZEN_DIGEST}" \
      "${HOSTING_VERSION}" \
      "${ROLLBACK_HOSTING_VERSION}" \
      "${HOSTING_EVIDENCE_SHA256}" \
      "${LIVE_REPORT_SHA256}" \
      "${BROWSER_REPORT_SHA256}" \
      "${SAMPLE_PLAN_SHA256}" \
      "${ACTIVE_MAPPING_EVIDENCE_SHA256}" \
      "${ACTIVE_CONTRACT_SHA256}" \
      "${FORM_CATALOG_DATA_SHA256}" \
      "${ACTIVE_MAPPING_DIGEST}" \
      "${MANIFEST_MAPPING_DIGEST}" \
      "${ACTIVE_REPLACEMENT_COUNT}" \
      "${CURRENT_RELEASE_REPLACEMENT_COUNT}" \
      "${HOSTING_PROJECT_ID}" \
      "${HOSTING_SITE}" \
      "${HOSTING_DEPLOYMENT_COMMIT}" \
      "${HOSTING_WORKFLOW_RUN_ID}" \
      "${HOSTING_WORKFLOW_RUN_ATTEMPT}" \
      "${HOSTING_RELEASE_NAME}" \
      "${HOSTING_DEPLOYED_AT}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
keys = (
    "releaseId",
    "sourceCommit",
    "previousReleaseId",
    "manifestObject",
    "manifestSha256",
    "frozenAttestationObject",
    "frozenAttestationSha256",
    "frozenDigest",
    "hostingVersion",
    "rollbackHostingVersion",
    "hostingEvidenceSha256",
    "liveReportSha256",
    "browserReportSha256",
    "samplePlanSha256",
    "activeMappingEvidenceSha256",
    "activeContractSha256",
    "formCatalogDataSha256",
    "activeMappingDigest",
    "manifestMappingDigest",
    "activeReplacementCount",
    "currentReleaseReplacementCount",
    "hostingProjectId",
    "hostingSite",
    "hostingDeploymentCommit",
    "hostingWorkflowRunId",
    "hostingWorkflowRunAttempt",
    "hostingEvidenceReleaseName",
    "hostingEvidenceReleaseTime",
)
expected_values = list(sys.argv[2:])
expected_values[2] = expected_values[2] or None
for key, expected in zip(keys, expected_values):
    if key in {"activeReplacementCount", "currentReleaseReplacementCount"}:
        expected = int(expected)
    if payload.get(key) != expected:
        raise SystemExit(
            f"Already-active catalog pointer {key} does not match this promotion"
        )
PY
    ALREADY_PROMOTED=1
  elif [[ "${CURRENT_RELEASE_ID}" != "${PREVIOUS_RELEASE_ID}" ]]; then
    echo "Active release ${CURRENT_RELEASE_ID} does not match previousReleaseId ${PREVIOUS_RELEASE_ID:-<none>}." >&2
    exit 1
  fi
else
  ACTIVE_GENERATION="0"
  if [[ -n "${PREVIOUS_RELEASE_ID}" ]]; then
    echo "No active release pointer exists, but previousReleaseId is ${PREVIOUS_RELEASE_ID}." >&2
    exit 1
  fi
fi

# Re-list the complete immutable release prefix under the shared production
# lock. This is O(n) evidence memory and O(ceil(n / page_size)) network pages,
# with no per-object subprocesses, immediately before the Hosting/pointer gate.
run_gcs_transport verify

(
  cd "${REPO_ROOT}"
  python3 -m scripts.form_catalog_factory snapshot-hosting \
    --project "${HOSTING_PROJECT_ID}" \
    --site "${HOSTING_SITE}" \
    --output "${TMP_LIVE_HOSTING_SNAPSHOT}" >/dev/null
)
IFS=$'\t' read -r \
  FRESH_HOSTING_VERSION \
  FRESH_HOSTING_RELEASE_NAME \
  FRESH_HOSTING_RELEASE_TIME \
  FRESH_HOSTING_VERIFIED_AT < <(
  python3 - "${TMP_LIVE_HOSTING_SNAPSHOT}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
print(
    "\t".join(
        (
            payload["hostingVersion"],
            payload["releaseName"],
            payload["releaseTime"],
            payload["capturedAt"],
        )
    )
)
PY
)
if [[ "${FRESH_HOSTING_VERSION}" != "${HOSTING_VERSION}" ]]; then
  echo "Live Firebase Hosting changed after validation: ${FRESH_HOSTING_VERSION} != ${HOSTING_VERSION}." >&2
  exit 1
fi
if [[ "${FRESH_HOSTING_RELEASE_NAME}" != "${HOSTING_RELEASE_NAME}" \
  || "${FRESH_HOSTING_RELEASE_TIME}" != "${HOSTING_DEPLOYED_AT}" ]]; then
  echo "The Firebase live-channel release identity changed after Hosting evidence was captured." >&2
  exit 1
fi

# Require the exact remote generation, owner, and at least five minutes of
# remaining lease immediately before the already-active branch or pointer CAS.
# This prevents a stale takeover during the final serialized mutation window.
bash "${PRODUCTION_LOCK}" \
  --action verify \
  --bucket "${BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --owner "${PRODUCTION_LOCK_OWNER}" \
  --state-file "${PRODUCTION_LOCK_STATE_FILE}" \
  --minimum-remaining-seconds 300

if [[ "${ALREADY_PROMOTED}" == "1" ]]; then
  python3 - \
    "${TMP_REMOTE_POINTER}" \
    "${FRESH_HOSTING_RELEASE_NAME}" \
    "${FRESH_HOSTING_RELEASE_TIME}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("hostingLiveReleaseName") != sys.argv[2]:
    raise SystemExit("Already-active pointer has a different live Hosting release")
if payload.get("hostingLiveReleaseTime") != sys.argv[3]:
    raise SystemExit("Already-active pointer has a different live Hosting release time")
PY
  if ! release_production_lock; then
    echo "Catalog release is already active and verified, but lock cleanup failed; the generation-bound lease must expire or be released manually." >&2
  fi
  echo "Catalog release ${RELEASE_ID} was already active with the exact immutable promotion evidence."
  exit 0
fi

python3 - \
  "${TMP_NEW_POINTER}" \
  "${RELEASE_ID}" \
  "${SOURCE_COMMIT}" \
  "${PREVIOUS_RELEASE_ID}" \
  "${MANIFEST_OBJECT}" \
  "${MANIFEST_SHA256}" \
  "${FROZEN_ATTESTATION_OBJECT}" \
  "${FROZEN_ATTESTATION_SHA256}" \
  "${FROZEN_DIGEST}" \
  "${HOSTING_VERSION}" \
  "${ROLLBACK_HOSTING_VERSION}" \
  "${HOSTING_EVIDENCE_SHA256}" \
  "${LIVE_REPORT_SHA256}" \
  "${BROWSER_REPORT_SHA256}" \
  "${SAMPLE_PLAN_SHA256}" \
  "${ACTIVE_MAPPING_EVIDENCE_SHA256}" \
  "${ACTIVE_CONTRACT_SHA256}" \
  "${FORM_CATALOG_DATA_SHA256}" \
  "${ACTIVE_MAPPING_DIGEST}" \
  "${MANIFEST_MAPPING_DIGEST}" \
  "${ACTIVE_REPLACEMENT_COUNT}" \
  "${CURRENT_RELEASE_REPLACEMENT_COUNT}" \
  "${HOSTING_PROJECT_ID}" \
  "${HOSTING_SITE}" \
  "${HOSTING_DEPLOYMENT_COMMIT}" \
  "${HOSTING_WORKFLOW_RUN_ID}" \
  "${HOSTING_WORKFLOW_RUN_ATTEMPT}" \
  "${HOSTING_RELEASE_NAME}" \
  "${HOSTING_DEPLOYED_AT}" \
  "${FRESH_HOSTING_RELEASE_NAME}" \
  "${FRESH_HOSTING_RELEASE_TIME}" \
  "${FRESH_HOSTING_VERIFIED_AT}" \
  "${PRODUCTION_LOCK_OWNER}" \
  "${PRODUCTION_LOCK_GENERATION}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

(
    output_path,
    release_id,
    source_commit,
    previous_release_id,
    manifest_object,
    manifest_sha256,
    frozen_attestation_object,
    frozen_attestation_sha256,
    frozen_digest,
    hosting_version,
    rollback_hosting_version,
    hosting_evidence_sha256,
    live_report_sha256,
    browser_report_sha256,
    sample_plan_sha256,
    active_mapping_evidence_sha256,
    active_contract_sha256,
    form_catalog_data_sha256,
    active_mapping_digest,
    manifest_mapping_digest,
    active_replacement_count,
    current_release_replacement_count,
    hosting_project_id,
    hosting_site,
    hosting_deployment_commit,
    hosting_workflow_run_id,
    hosting_workflow_run_attempt,
    hosting_evidence_release_name,
    hosting_evidence_release_time,
    hosting_live_release_name,
    hosting_live_release_time,
    hosting_verified_at,
    promotion_lock_owner,
    promotion_lock_generation,
) = sys.argv[1:]
payload = {
    "schemaVersion": 1,
    "releaseId": release_id,
    "sourceCommit": source_commit,
    "previousReleaseId": previous_release_id or None,
    "manifestObject": manifest_object,
    "manifestSha256": manifest_sha256,
    "frozenAttestationObject": frozen_attestation_object,
    "frozenAttestationSha256": frozen_attestation_sha256,
    "frozenDigest": frozen_digest,
    "hostingVersion": hosting_version,
    "rollbackHostingVersion": rollback_hosting_version,
    "hostingEvidenceSha256": hosting_evidence_sha256,
    "liveReportSha256": live_report_sha256,
    "browserReportSha256": browser_report_sha256,
    "samplePlanSha256": sample_plan_sha256,
    "activeMappingEvidenceSha256": active_mapping_evidence_sha256,
    "activeContractSha256": active_contract_sha256,
    "formCatalogDataSha256": form_catalog_data_sha256,
    "activeMappingDigest": active_mapping_digest,
    "manifestMappingDigest": manifest_mapping_digest,
    "activeReplacementCount": int(active_replacement_count),
    "currentReleaseReplacementCount": int(current_release_replacement_count),
    "hostingProjectId": hosting_project_id,
    "hostingSite": hosting_site,
    "hostingDeploymentCommit": hosting_deployment_commit,
    "hostingWorkflowRunId": hosting_workflow_run_id,
    "hostingWorkflowRunAttempt": hosting_workflow_run_attempt,
    "hostingEvidenceReleaseName": hosting_evidence_release_name,
    "hostingEvidenceReleaseTime": hosting_evidence_release_time,
    "hostingLiveReleaseName": hosting_live_release_name,
    "hostingLiveReleaseTime": hosting_live_release_time,
    "hostingVerifiedAt": hosting_verified_at,
    "promotionLockOwner": promotion_lock_owner,
    "promotionLockGeneration": promotion_lock_generation,
    "promotedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
}
Path(output_path).write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

gcloud storage cp \
  "${TMP_NEW_POINTER}" \
  "${ACTIVE_URL}" \
  --project "${PROJECT_ID}" \
  --if-generation-match "${ACTIVE_GENERATION}" \
  --content-type "application/json" \
  --cache-control "no-store,max-age=0" \
  --custom-metadata "catalog_release_id=${RELEASE_ID},catalog_source_commit=${SOURCE_COMMIT},catalog_frozen_digest=${FROZEN_DIGEST},catalog_frozen_attestation_sha256=${FROZEN_ATTESTATION_SHA256},catalog_active_mapping_digest=${ACTIVE_MAPPING_DIGEST},catalog_active_contract_sha256=${ACTIVE_CONTRACT_SHA256},catalog_form_data_sha256=${FORM_CATALOG_DATA_SHA256}"

gcloud storage cp "${ACTIVE_URL}" "${TMP_REMOTE_POINTER}" \
  --project "${PROJECT_ID}" >/dev/null
python3 - \
  "${TMP_REMOTE_POINTER}" \
  "${RELEASE_ID}" \
  "${SOURCE_COMMIT}" \
  "${PREVIOUS_RELEASE_ID}" \
  "${MANIFEST_OBJECT}" \
  "${MANIFEST_SHA256}" \
  "${FROZEN_ATTESTATION_OBJECT}" \
  "${FROZEN_ATTESTATION_SHA256}" \
  "${FROZEN_DIGEST}" \
  "${HOSTING_VERSION}" \
  "${ROLLBACK_HOSTING_VERSION}" \
  "${HOSTING_EVIDENCE_SHA256}" \
  "${LIVE_REPORT_SHA256}" \
  "${BROWSER_REPORT_SHA256}" \
  "${SAMPLE_PLAN_SHA256}" \
  "${ACTIVE_MAPPING_EVIDENCE_SHA256}" \
  "${ACTIVE_CONTRACT_SHA256}" \
  "${FORM_CATALOG_DATA_SHA256}" \
  "${ACTIVE_MAPPING_DIGEST}" \
  "${MANIFEST_MAPPING_DIGEST}" \
  "${ACTIVE_REPLACEMENT_COUNT}" \
  "${CURRENT_RELEASE_REPLACEMENT_COUNT}" \
  "${HOSTING_PROJECT_ID}" \
  "${HOSTING_SITE}" \
  "${HOSTING_DEPLOYMENT_COMMIT}" \
  "${HOSTING_WORKFLOW_RUN_ID}" \
  "${HOSTING_WORKFLOW_RUN_ATTEMPT}" \
  "${HOSTING_RELEASE_NAME}" \
  "${HOSTING_DEPLOYED_AT}" \
  "${FRESH_HOSTING_RELEASE_NAME}" \
  "${FRESH_HOSTING_RELEASE_TIME}" \
  "${FRESH_HOSTING_VERIFIED_AT}" \
  "${PRODUCTION_LOCK_OWNER}" \
  "${PRODUCTION_LOCK_GENERATION}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
keys = (
    "releaseId",
    "sourceCommit",
    "previousReleaseId",
    "manifestObject",
    "manifestSha256",
    "frozenAttestationObject",
    "frozenAttestationSha256",
    "frozenDigest",
    "hostingVersion",
    "rollbackHostingVersion",
    "hostingEvidenceSha256",
    "liveReportSha256",
    "browserReportSha256",
    "samplePlanSha256",
    "activeMappingEvidenceSha256",
    "activeContractSha256",
    "formCatalogDataSha256",
    "activeMappingDigest",
    "manifestMappingDigest",
    "activeReplacementCount",
    "currentReleaseReplacementCount",
    "hostingProjectId",
    "hostingSite",
    "hostingDeploymentCommit",
    "hostingWorkflowRunId",
    "hostingWorkflowRunAttempt",
    "hostingEvidenceReleaseName",
    "hostingEvidenceReleaseTime",
    "hostingLiveReleaseName",
    "hostingLiveReleaseTime",
    "hostingVerifiedAt",
    "promotionLockOwner",
    "promotionLockGeneration",
)
for key, expected in zip(keys, sys.argv[2:]):
    actual = payload.get(key)
    if key == "previousReleaseId":
        expected = expected or None
    if key in {"activeReplacementCount", "currentReleaseReplacementCount"}:
        expected = int(expected)
    if actual != expected:
        raise SystemExit(f"Active catalog release pointer {key} verification failed")
PY

if ! release_production_lock; then
  echo "Catalog pointer is active and verified, but lock cleanup failed; the generation-bound lease must expire or be released manually." >&2
fi

echo "Promoted catalog release ${RELEASE_ID} from exact commit ${SOURCE_COMMIT} on hosting version ${HOSTING_VERSION}."
