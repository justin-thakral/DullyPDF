#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DEPLOY_RELEASE="${SCRIPT_DIR}/deploy-form-catalog-release.sh"
PRODUCTION_LOCK="${SCRIPT_DIR}/form-catalog-production-lock.sh"
GIT_ACTIVE_REFERENCE="${REPO_ROOT}/form_catalog_releases/active.json"
GIT_DATA_REFERENCE="${REPO_ROOT}/frontend/src/config/formCatalogData.mjs"

MANIFEST=""
FROZEN_LEDGER_MANIFEST=""
ASSET_ROOT=""
HOSTING_EVIDENCE=""
ACTIVE_MAPPING_EVIDENCE=""
ACTIVE_RELEASE_CONTRACT="form_catalog_releases/active.json"
FORM_CATALOG_DATA="frontend/src/config/formCatalogData.mjs"
SAMPLE_PLAN=""
SELECTION=""
BUILD_REPORT=""
LIVE_REPORT=""
BROWSER_OUTPUT_DIR=""
ROLLBACK_RECEIPT=""
EXPECTED_COMMIT=""
EXPECTED_DEPLOYMENT_COMMIT=""
EXPECTED_WORKFLOW_RUN_ID=""
EXPECTED_WORKFLOW_RUN_ATTEMPT=""
BUCKET_URL="gs://dullypdf-form-catalog-assets-east4"
PROJECT_ID="dullypdf"
HOSTING_SITE="dullypdf"
ACTIVE_OBJECT="catalog-release-state/active.json"
MAX_FORMS="1000"
LIVE_TIMEOUT_SECONDS="30"
BROWSER_TIMEOUT_MS="120000"
EXECUTE=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/finalize-form-catalog-release.sh \
    --manifest <release.json> \
    --frozen-ledger-manifest <frozen-ledger-manifest.json> \
    --asset-root <release-directory> \
    --hosting-evidence <hosting-evidence.json> \
    --active-mapping-evidence <active-mapping.json> \
    --sample-plan <live-samples.json> \
    --selection <selection.json> \
    --build-report <build-report.json> \
    --live-report <live-http-report.json> \
    --browser-output-dir <browser-evidence-directory> \
    --rollback-receipt <hosting-rollback.json> \
    --expected-commit <release-source-commit> \
    --expected-deployment-commit <hosting-deploy-commit> \
    --expected-workflow-run-id <run-id> \
    --expected-workflow-run-attempt <attempt> \
    [--active-release-contract <active.json>] \
    [--form-catalog-data <formCatalogData.mjs>] \
    [--max-forms <count>] \
    [--live-timeout-seconds <seconds>] \
    [--browser-timeout-ms <milliseconds>] \
    [--execute]

Without --execute, the command validates local release bindings and prints the
locked post-live plan. Execution is pinned to the production project, bucket,
Hosting site, origins, asset base, and active pointer.

The browser producer requires DULLYPDF_E2E_EMAIL/DULLYPDF_E2E_PASSWORD or the
SMOKE_LOGIN_EMAIL/SMOKE_LOGIN_PASSWORD aliases. The account must have one
generated-PDF download available for each planned browser canary.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
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
    --live-report)
      LIVE_REPORT="${2:-}"
      shift 2
      ;;
    --browser-output-dir)
      BROWSER_OUTPUT_DIR="${2:-}"
      shift 2
      ;;
    --rollback-receipt)
      ROLLBACK_RECEIPT="${2:-}"
      shift 2
      ;;
    --expected-commit)
      EXPECTED_COMMIT="${2:-}"
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
    --max-forms)
      MAX_FORMS="${2:-}"
      shift 2
      ;;
    --live-timeout-seconds)
      LIVE_TIMEOUT_SECONDS="${2:-}"
      shift 2
      ;;
    --browser-timeout-ms)
      BROWSER_TIMEOUT_MS="${2:-}"
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

required_values=(
  MANIFEST
  FROZEN_LEDGER_MANIFEST
  ASSET_ROOT
  HOSTING_EVIDENCE
  ACTIVE_MAPPING_EVIDENCE
  SAMPLE_PLAN
  SELECTION
  BUILD_REPORT
  LIVE_REPORT
  BROWSER_OUTPUT_DIR
  ROLLBACK_RECEIPT
  EXPECTED_COMMIT
  EXPECTED_DEPLOYMENT_COMMIT
  EXPECTED_WORKFLOW_RUN_ID
  EXPECTED_WORKFLOW_RUN_ATTEMPT
)
for value_name in "${required_values[@]}"; do
  if [[ -z "${!value_name}" ]]; then
    echo "--${value_name,,} is required." >&2
    exit 1
  fi
done
if [[ ! "${MAX_FORMS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--max-forms must be a positive integer." >&2
  exit 1
fi
if [[ ! "${LIVE_TIMEOUT_SECONDS}" =~ ^[1-9][0-9]*$ ]]; then
  echo "--live-timeout-seconds must be a positive integer." >&2
  exit 1
fi
if [[ ! "${BROWSER_TIMEOUT_MS}" =~ ^[1-9][0-9]*$ ]] \
  || (( BROWSER_TIMEOUT_MS < 30000 || BROWSER_TIMEOUT_MS > 300000 )); then
  echo "--browser-timeout-ms must be from 30000 through 300000." >&2
  exit 1
fi

for path_var in \
  MANIFEST \
  FROZEN_LEDGER_MANIFEST \
  ASSET_ROOT \
  HOSTING_EVIDENCE \
  ACTIVE_MAPPING_EVIDENCE \
  ACTIVE_RELEASE_CONTRACT \
  FORM_CATALOG_DATA \
  SAMPLE_PLAN \
  SELECTION \
  BUILD_REPORT \
  LIVE_REPORT \
  BROWSER_OUTPUT_DIR \
  ROLLBACK_RECEIPT; do
  path="${!path_var}"
  if [[ "${path}" != /* ]]; then
    printf -v "${path_var}" '%s/%s' "${REPO_ROOT}" "${path}"
  fi
done

for input_path in \
  "${MANIFEST}" \
  "${FROZEN_LEDGER_MANIFEST}" \
  "${HOSTING_EVIDENCE}" \
  "${ACTIVE_MAPPING_EVIDENCE}" \
  "${ACTIVE_RELEASE_CONTRACT}" \
  "${FORM_CATALOG_DATA}" \
  "${SAMPLE_PLAN}" \
  "${SELECTION}" \
  "${BUILD_REPORT}"; do
  if [[ ! -f "${input_path}" ]]; then
    echo "Missing required input: ${input_path}" >&2
    exit 1
  fi
done
if [[ ! -d "${ASSET_ROOT}" ]]; then
  echo "Asset root is not a directory: ${ASSET_ROOT}" >&2
  exit 1
fi
command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required." >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo "jq is required." >&2
  exit 1
}
command -v npm >/dev/null 2>&1 || {
  echo "npm is required." >&2
  exit 1
}

TMP_CONTROL_INPUTS="$(mktemp -d)"
TMP_ACTIVE_RECHECK="$(mktemp)"
TMP_HOSTING_SNAPSHOT="$(mktemp)"
TMP_POINTER_SNAPSHOT="$(mktemp)"
TMP_LOCK_STATE="$(mktemp)"
LOCK_OWNER=""
LOCK_ACQUIRED=0
LOCK_GENERATION=""
ROLLBACK_ARMED=0
LOCK_RELEASE_SAFE=1
CLEANUP_RUNNING=0
TERMINATION_SIGNAL=""

release_lock() {
  if [[ "${LOCK_ACQUIRED}" != "1" ]]; then
    return 0
  fi
  if ! bash "${PRODUCTION_LOCK}" \
    --action release \
    --bucket "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --owner "${LOCK_OWNER}" \
    --state-file "${TMP_LOCK_STATE}"; then
    return 1
  fi
  LOCK_ACQUIRED=0
}

cleanup() {
  local original_status="${1:-1}"
  local safety_failure=0
  local trigger_stage="unexpected-exit"
  trap - EXIT INT TERM HUP
  if [[ "${CLEANUP_RUNNING}" == "1" ]]; then
    exit "${original_status}"
  fi
  CLEANUP_RUNNING=1
  set +e
  if [[ -n "${TERMINATION_SIGNAL}" ]]; then
    trigger_stage="unexpected-signal-${TERMINATION_SIGNAL}"
  fi
  if [[ "${LOCK_ACQUIRED}" == "1" && "${ROLLBACK_ARMED}" == "1" ]]; then
    echo "Unexpected pre-promotion termination; classifying and attempting the guarded Hosting rollback." >&2
    if perform_locked_rollback "${trigger_stage}" "${original_status}"; then
      ROLLBACK_ARMED=0
      LOCK_RELEASE_SAFE=1
      echo "Guarded Hosting rollback completed before production lock release." >&2
    else
      safety_failure=1
      echo "Guarded Hosting rollback was refused or failed; no unsafe fallback mutation was attempted." >&2
    fi
  fi
  if [[ "${LOCK_ACQUIRED}" == "1" ]]; then
    if [[ "${safety_failure}" != "0" || "${LOCK_RELEASE_SAFE}" != "1" ]]; then
      retained_lock_state="${ROLLBACK_RECEIPT}.lock-state.json"
      mkdir -p "$(dirname "${retained_lock_state}")"
      cp -- "${TMP_LOCK_STATE}" "${retained_lock_state}"
      echo "Retaining the production lock lease because no verified terminal Hosting state exists. Lock state: ${retained_lock_state}" >&2
    elif ! release_lock; then
      safety_failure=1
      echo "Failed to release the shared production deployment lock." >&2
    fi
  fi
  rm -f \
    "${TMP_ACTIVE_RECHECK}" \
    "${TMP_HOSTING_SNAPSHOT}" \
    "${TMP_POINTER_SNAPSHOT}" \
    "${TMP_LOCK_STATE}" || true
  rm -rf "${TMP_CONTROL_INPUTS}" || true
  if [[ "${original_status}" == "0" && "${safety_failure}" != "0" ]]; then
    original_status=1
  fi
  exit "${original_status}"
}
trap 'cleanup $?' EXIT
trap 'TERMINATION_SIGNAL=HUP; exit 129' HUP
trap 'TERMINATION_SIGNAL=INT; exit 130' INT
trap 'TERMINATION_SIGNAL=TERM; exit 143' TERM

# Several authoring terminals can share this worktree. Snapshot every small
# control input before validation so a concurrent rewrite cannot change the
# rollback target or the evidence consumed during the long HTTP/browser gate.
cp -- "${MANIFEST}" "${TMP_CONTROL_INPUTS}/release.json"
cp -- "${FROZEN_LEDGER_MANIFEST}" "${TMP_CONTROL_INPUTS}/frozen-ledger-manifest.json"
cp -- "${HOSTING_EVIDENCE}" "${TMP_CONTROL_INPUTS}/hosting-evidence.json"
cp -- "${ACTIVE_MAPPING_EVIDENCE}" "${TMP_CONTROL_INPUTS}/active-mapping.json"
cp -- "${ACTIVE_RELEASE_CONTRACT}" "${TMP_CONTROL_INPUTS}/active.json"
cp -- "${FORM_CATALOG_DATA}" "${TMP_CONTROL_INPUTS}/formCatalogData.mjs"
cp -- "${SAMPLE_PLAN}" "${TMP_CONTROL_INPUTS}/sample-plan.json"
cp -- "${SELECTION}" "${TMP_CONTROL_INPUTS}/selection.json"
cp -- "${BUILD_REPORT}" "${TMP_CONTROL_INPUTS}/build-report.json"
ACTIVE_RELEASE_SNAPSHOT="${TMP_CONTROL_INPUTS}/active.json"
FORM_CATALOG_DATA_SNAPSHOT="${TMP_CONTROL_INPUTS}/formCatalogData.mjs"
MANIFEST="${TMP_CONTROL_INPUTS}/release.json"
FROZEN_LEDGER_MANIFEST="${TMP_CONTROL_INPUTS}/frozen-ledger-manifest.json"
HOSTING_EVIDENCE="${TMP_CONTROL_INPUTS}/hosting-evidence.json"
ACTIVE_MAPPING_EVIDENCE="${TMP_CONTROL_INPUTS}/active-mapping.json"
SAMPLE_PLAN="${TMP_CONTROL_INPUTS}/sample-plan.json"
SELECTION="${TMP_CONTROL_INPUTS}/selection.json"
BUILD_REPORT="${TMP_CONTROL_INPUTS}/build-report.json"

python3 -m scripts.form_catalog_factory verify-active-mapping \
  --active-release "${ACTIVE_RELEASE_SNAPSHOT}" \
  --form-catalog-data "${FORM_CATALOG_DATA_SNAPSHOT}" \
  --manifest "${MANIFEST}" \
  --repo-root "${REPO_ROOT}" \
  --git-active-reference "${GIT_ACTIVE_REFERENCE}" \
  --git-data-reference "${GIT_DATA_REFERENCE}" \
  --expected-git-commit "${EXPECTED_DEPLOYMENT_COMMIT}" \
  --expected-report "${ACTIVE_MAPPING_EVIDENCE}" \
  --output "${TMP_ACTIVE_RECHECK}" >/dev/null

FINALIZATION_IDENTITY_FILE="${TMP_CONTROL_INPUTS}/finalization-identity.bin"
if ! python3 - \
    "${MANIFEST}" \
    "${HOSTING_EVIDENCE}" \
    "${ACTIVE_MAPPING_EVIDENCE}" \
    "${SAMPLE_PLAN}" \
    "${EXPECTED_COMMIT}" \
    "${EXPECTED_DEPLOYMENT_COMMIT}" \
    "${EXPECTED_WORKFLOW_RUN_ID}" \
    "${EXPECTED_WORKFLOW_RUN_ATTEMPT}" \
    "${ACTIVE_RELEASE_SNAPSHOT}" \
    "${FORM_CATALOG_DATA_SNAPSHOT}" \
    >"${FINALIZATION_IDENTITY_FILE}" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

manifest_path = Path(sys.argv[1])
hosting_path = Path(sys.argv[2])
mapping_path = Path(sys.argv[3])
sample_path = Path(sys.argv[4])
expected_commit = sys.argv[5].lower()
expected_deployment_commit = sys.argv[6].lower()
expected_run_id = sys.argv[7]
expected_run_attempt = sys.argv[8]
active_path = Path(sys.argv[9])
data_path = Path(sys.argv[10])

def load(path):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, dict):
        raise SystemExit(f"{path} must contain a JSON object")
    return payload

def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

manifest = load(manifest_path)
hosting = load(hosting_path)
mapping = load(mapping_path)
release_id = manifest.get("releaseId")
source_commit = str(manifest.get("sourceCommit") or "").lower()
previous_release_id = manifest.get("previousReleaseId")
manifest_sha256 = sha(manifest_path)
if source_commit != expected_commit:
    raise SystemExit("Release manifest sourceCommit does not match --expected-commit")
if previous_release_id is not None and (
    not isinstance(previous_release_id, str) or not previous_release_id.strip()
):
    raise SystemExit("Release manifest previousReleaseId must be null or a nonempty string")
expected_identity = {
    "releaseId": release_id,
    "sourceCommit": source_commit,
    "manifestSha256": manifest_sha256,
}
for key, expected in expected_identity.items():
    if hosting.get(key) != expected or mapping.get(key) != expected:
        raise SystemExit(f"Hosting or active mapping evidence {key} mismatch")
if hosting.get("deploymentCommit") != expected_deployment_commit:
    raise SystemExit("Hosting evidence deploymentCommit mismatch")
if hosting.get("workflowRunId") != expected_run_id:
    raise SystemExit("Hosting evidence workflowRunId mismatch")
if hosting.get("workflowRunAttempt") != expected_run_attempt:
    raise SystemExit("Hosting evidence workflowRunAttempt mismatch")
if hosting.get("activeMappingEvidenceSha256") != sha(mapping_path):
    raise SystemExit("Hosting evidence active-mapping report hash mismatch")
mapping_fields = (
    "activeContractSha256",
    "formCatalogDataSha256",
    "releaseManifestSha256",
    "activeMappingDigest",
    "manifestMappingDigest",
    "activeReplacementCount",
    "currentReleaseReplacementCount",
)
for key in mapping_fields:
    if hosting.get(key) != mapping.get(key):
        raise SystemExit(f"Hosting evidence {key} mismatch")
if (
    hosting.get("mappingGitCommit") != mapping.get("gitCommit")
    or mapping.get("gitCommit") != expected_deployment_commit
):
    raise SystemExit("Hosting active-mapping Git commit mismatch")
if mapping.get("activeContractSha256") != sha(active_path):
    raise SystemExit("Active contract bytes changed after mapping verification")
if mapping.get("formCatalogDataSha256") != sha(data_path):
    raise SystemExit("Generated catalog bytes changed after mapping verification")

values = (
    release_id,
    source_commit,
    previous_release_id or "",
    manifest_sha256,
    hosting.get("hostingVersion"),
    hosting.get("rollbackHostingVersion"),
    hosting.get("hostingReleaseName"),
    hosting.get("deployedAt"),
    sha(sample_path),
)
if any(not isinstance(value, str) or not value for value in values[:2] + values[3:]):
    raise SystemExit("Release finalization evidence has a missing required identity")
if any("\0" in value for value in values):
    raise SystemExit("Release finalization identity contains a NUL byte")
sys.stdout.buffer.write(
    b"\0".join(value.encode("utf-8") for value in values) + b"\0"
)
PY
then
  echo "Release finalization identity validation failed." >&2
  exit 1
fi
mapfile -d '' -t FINALIZATION_IDENTITY <"${FINALIZATION_IDENTITY_FILE}"
if [[ "${#FINALIZATION_IDENTITY[@]}" -ne 9 ]]; then
  echo "Release finalization identity handoff did not produce exactly nine fields." >&2
  exit 1
fi
RELEASE_ID="${FINALIZATION_IDENTITY[0]}"
SOURCE_COMMIT="${FINALIZATION_IDENTITY[1]}"
PREVIOUS_RELEASE_ID="${FINALIZATION_IDENTITY[2]}"
MANIFEST_SHA256="${FINALIZATION_IDENTITY[3]}"
HOSTING_VERSION="${FINALIZATION_IDENTITY[4]}"
ROLLBACK_HOSTING_VERSION="${FINALIZATION_IDENTITY[5]}"
HOSTING_RELEASE_NAME="${FINALIZATION_IDENTITY[6]}"
HOSTING_RELEASE_TIME="${FINALIZATION_IDENTITY[7]}"
SAMPLE_PLAN_SHA256="${FINALIZATION_IDENTITY[8]}"

if [[ "${EXPECTED_COMMIT,,}" != "${SOURCE_COMMIT}" ]]; then
  echo "Expected source commit does not match the release manifest." >&2
  exit 1
fi

bash "${DEPLOY_RELEASE}" \
  --action validate \
  --manifest "${MANIFEST}" \
  --frozen-ledger-manifest "${FROZEN_LEDGER_MANIFEST}" \
  --asset-root "${ASSET_ROOT}" \
  --max-forms "${MAX_FORMS}" >/dev/null

BROWSER_REPORT="${BROWSER_OUTPUT_DIR}/browser-canary-report.json"
INVENTORY_REPORT="${BROWSER_OUTPUT_DIR}/promotion-gcs-inventory.json"
ACTIVE_URL="${BUCKET_URL}/${ACTIVE_OBJECT}"

promote_release() {
  local promotion_args=(
    --action promote
    --manifest "${MANIFEST}"
    --frozen-ledger-manifest "${FROZEN_LEDGER_MANIFEST}"
    --asset-root "${ASSET_ROOT}"
    --bucket "${BUCKET_URL}"
    --project "${PROJECT_ID}"
    --expected-commit "${SOURCE_COMMIT}"
    --max-forms "${MAX_FORMS}"
    --hosting-evidence "${HOSTING_EVIDENCE}"
    --active-mapping-evidence "${ACTIVE_MAPPING_EVIDENCE}"
    --active-release-contract "${ACTIVE_RELEASE_SNAPSHOT}"
    --form-catalog-data "${FORM_CATALOG_DATA_SNAPSHOT}"
    --live-report "${LIVE_REPORT}"
    --browser-report "${BROWSER_REPORT}"
    --inventory-report "${INVENTORY_REPORT}"
    --sample-plan "${SAMPLE_PLAN}"
    --selection "${SELECTION}"
    --build-report "${BUILD_REPORT}"
    --expected-deployment-commit "${EXPECTED_DEPLOYMENT_COMMIT}"
    --expected-workflow-run-id "${EXPECTED_WORKFLOW_RUN_ID}"
    --expected-workflow-run-attempt "${EXPECTED_WORKFLOW_RUN_ATTEMPT}"
    --external-production-lock-state "${TMP_LOCK_STATE}"
    --external-production-lock-owner "${LOCK_OWNER}"
  )
  # The inventory receipt is durable browser-adjacent evidence. Creating the
  # directory here covers initial, retry, and already-promoted verification.
  mkdir -p "${BROWSER_OUTPUT_DIR}"
  bash "${DEPLOY_RELEASE}" "${promotion_args[@]}" --execute
}

snapshot_pointer() {
  python3 -m scripts.form_catalog_factory snapshot-catalog-pointer \
    --project "${PROJECT_ID}" \
    --object-url "${ACTIVE_URL}" \
    --output "${TMP_POINTER_SNAPSHOT}" >/dev/null
}

snapshot_hosting() {
  python3 -m scripts.form_catalog_factory snapshot-hosting \
    --project "${PROJECT_ID}" \
    --site "${HOSTING_SITE}" \
    --output "${TMP_HOSTING_SNAPSHOT}" >/dev/null
}

perform_locked_rollback() {
  local trigger_stage="$1"
  local trigger_exit_code="$2"
  local rollback_args=(
    --hosting-evidence "${HOSTING_EVIDENCE}"
    --pointer-object-url "${ACTIVE_URL}"
    --lock-owner "${LOCK_OWNER}"
    --lock-generation "${LOCK_GENERATION}"
    --lock-state-file "${TMP_LOCK_STATE}"
    --trigger-stage "${trigger_stage}"
    --trigger-exit-code "${trigger_exit_code}"
    --output "${ROLLBACK_RECEIPT}"
  )
  if [[ -n "${PREVIOUS_RELEASE_ID}" ]]; then
    rollback_args+=(--previous-release-id "${PREVIOUS_RELEASE_ID}")
  fi
  bash "${PRODUCTION_LOCK}" \
    --action verify \
    --bucket "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --owner "${LOCK_OWNER}" \
    --state-file "${TMP_LOCK_STATE}" || return 1
  mkdir -p "$(dirname "${ROLLBACK_RECEIPT}")"
  python3 -m scripts.form_catalog_factory rollback-hosting \
    "${rollback_args[@]}"
}

rollback_after_failure() {
  local trigger_stage="$1"
  local trigger_exit_code="$2"
  if ! perform_locked_rollback "${trigger_stage}" "${trigger_exit_code}"; then
    echo "Post-live gate failed and automatic rollback was refused or failed." >&2
    exit 1
  fi
  ROLLBACK_ARMED=0
  LOCK_RELEASE_SAFE=1
  if ! release_lock; then
    echo "Hosting rollback is verified, but shared lock cleanup failed." >&2
    exit 1
  fi
  echo "Post-live ${trigger_stage} failed. Firebase Hosting was rolled back; the catalog pointer was not promoted."
  exit "${trigger_exit_code}"
}

if [[ "${EXECUTE}" == "0" ]]; then
  echo "Catalog release ${RELEASE_ID} local bindings passed."
  echo "+ acquire ${BUCKET_URL}/catalog-release-state/production-deployment.lock"
  echo "+ require live Hosting ${HOSTING_VERSION} and the unchanged previous catalog pointer"
  echo "+ produce exact HTTP evidence at ${LIVE_REPORT}"
  echo "+ run the real Playwright fill/save/reopen canaries at ${BROWSER_OUTPUT_DIR}"
  echo "+ promote the generation-guarded catalog pointer using the same lock"
  echo "+ on a pre-CAS failure, release recorded Hosting version ${ROLLBACK_HOSTING_VERSION} and write ${ROLLBACK_RECEIPT}"
  echo "Dry run only. Add --execute to run the post-live gate."
  exit 0
fi

LOCK_OWNER="catalog-post-live:${RELEASE_ID}:$$:$(date +%s)"
bash "${PRODUCTION_LOCK}" \
  --action acquire \
  --bucket "${BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --owner "${LOCK_OWNER}" \
  --state-file "${TMP_LOCK_STATE}"
LOCK_ACQUIRED=1
LOCK_RELEASE_SAFE=0
LOCK_GENERATION="$(
  jq -r '.generation // empty' "${TMP_LOCK_STATE}"
)"
if [[ -z "${LOCK_GENERATION}" ]]; then
  echo "Production lock state has no generation." >&2
  exit 1
fi

snapshot_pointer
POINTER_EXISTS="$(jq -r '.exists' "${TMP_POINTER_SNAPSHOT}")"
POINTER_RELEASE_ID="$(jq -r '.releaseId // empty' "${TMP_POINTER_SNAPSHOT}")"
if [[ "${POINTER_RELEASE_ID}" == "${RELEASE_ID}" ]]; then
  LOCK_RELEASE_SAFE=1
  if [[ ! -f "${LIVE_REPORT}" || ! -f "${BROWSER_REPORT}" ]]; then
    echo "Catalog pointer already names ${RELEASE_ID}, but exact local promotion reports are missing. Automatic rollback is forbidden." >&2
    exit 1
  fi
  promote_release
  release_lock
  echo "Catalog release ${RELEASE_ID} was already promoted with exact evidence."
  exit 0
fi
if [[ -n "${PREVIOUS_RELEASE_ID}" ]]; then
  if [[ "${POINTER_EXISTS}" != "true" \
    || "${POINTER_RELEASE_ID}" != "${PREVIOUS_RELEASE_ID}" ]]; then
    echo "Catalog pointer changed away from previousReleaseId=${PREVIOUS_RELEASE_ID}; automatic finalization and rollback are forbidden." >&2
    LOCK_RELEASE_SAFE=1
    exit 1
  fi
elif [[ "${POINTER_EXISTS}" != "false" ]]; then
  echo "The first catalog release requires an absent operational pointer." >&2
  LOCK_RELEASE_SAFE=1
  exit 1
fi

snapshot_hosting
FRESH_HOSTING_VERSION="$(jq -r '.hostingVersion // empty' "${TMP_HOSTING_SNAPSHOT}")"
FRESH_HOSTING_RELEASE_NAME="$(jq -r '.releaseName // empty' "${TMP_HOSTING_SNAPSHOT}")"
FRESH_HOSTING_RELEASE_TIME="$(jq -r '.releaseTime // empty' "${TMP_HOSTING_SNAPSHOT}")"
if [[ "${FRESH_HOSTING_VERSION}" == "${ROLLBACK_HOSTING_VERSION}" ]]; then
  ROLLBACK_ARMED=1
  rollback_after_failure "retry-after-rollback" 1
fi
if [[ "${FRESH_HOSTING_VERSION}" != "${HOSTING_VERSION}" \
  || "${FRESH_HOSTING_RELEASE_NAME}" != "${HOSTING_RELEASE_NAME}" \
  || "${FRESH_HOSTING_RELEASE_TIME}" != "${HOSTING_RELEASE_TIME}" ]]; then
  echo "Live Hosting changed after the controlled-deploy receipt. Automatic rollback is forbidden." >&2
  LOCK_RELEASE_SAFE=1
  exit 1
fi
ROLLBACK_ARMED=1

mkdir -p "$(dirname "${LIVE_REPORT}")"
rm -f "${LIVE_REPORT}"
set +e
python3 -m scripts.form_catalog_factory validate-live \
  --sample-plan "${SAMPLE_PLAN}" \
  --site-origin "https://dullypdf.com" \
  --site-origin "https://dullypdf.web.app" \
  --asset-base-url "https://storage.googleapis.com/dullypdf-form-catalog-assets-east4" \
  --hosting-version "${HOSTING_VERSION}" \
  --timeout-seconds "${LIVE_TIMEOUT_SECONDS}" \
  --output "${LIVE_REPORT}"
LIVE_STATUS=$?
set -e
if [[ "${LIVE_STATUS}" != "0" ]]; then
  rollback_after_failure "live-http" "${LIVE_STATUS}"
fi

mkdir -p "${BROWSER_OUTPUT_DIR}"
set +e
npm run test:playwright:form-catalog-canary -- \
  --sample-plan "${SAMPLE_PLAN}" \
  --manifest "${MANIFEST}" \
  --hosting-evidence "${HOSTING_EVIDENCE}" \
  --expected-source-commit "${SOURCE_COMMIT}" \
  --expected-manifest-sha256 "${MANIFEST_SHA256}" \
  --expected-sample-plan-sha256 "${SAMPLE_PLAN_SHA256}" \
  --expected-hosting-version "${HOSTING_VERSION}" \
  --site-origin "https://dullypdf.com" \
  --asset-base-url "https://storage.googleapis.com/dullypdf-form-catalog-assets-east4" \
  --output-dir "${BROWSER_OUTPUT_DIR}" \
  --timeout-ms "${BROWSER_TIMEOUT_MS}" \
  --overwrite
BROWSER_STATUS=$?
set -e
if [[ "${BROWSER_STATUS}" != "0" || ! -f "${BROWSER_REPORT}" ]]; then
  if [[ "${BROWSER_STATUS}" == "0" ]]; then
    BROWSER_STATUS=1
  fi
  rollback_after_failure "browser-canary" "${BROWSER_STATUS}"
fi

set +e
promote_release
PROMOTION_STATUS=$?
set -e
if [[ "${PROMOTION_STATUS}" != "0" ]]; then
  snapshot_pointer
  POINTER_RELEASE_ID="$(jq -r '.releaseId // empty' "${TMP_POINTER_SNAPSHOT}")"
  if [[ "${POINTER_RELEASE_ID}" == "${RELEASE_ID}" ]]; then
    ROLLBACK_ARMED=0
    LOCK_RELEASE_SAFE=1
    # The first promotion may have crossed the pointer CAS before losing its
    # response. A full exact retry is the only safe way to classify success.
    if promote_release; then
      release_lock
      echo "Recovered an exact promotion after the catalog pointer CAS."
      exit 0
    fi
    echo "Catalog pointer crossed the promotion CAS but exact retry failed. Automatic rollback is forbidden." >&2
    exit 1
  fi
  rollback_after_failure "pointer-promotion" "${PROMOTION_STATUS}"
fi

ROLLBACK_ARMED=0
LOCK_RELEASE_SAFE=1
release_lock
echo "Finalized catalog release ${RELEASE_ID}: live HTTP, browser canaries, and pointer promotion all passed."
