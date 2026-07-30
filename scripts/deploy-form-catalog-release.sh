#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
VALIDATOR="${SCRIPT_DIR}/validate-form-catalog-release.py"

ACTION="stage"
MANIFEST=""
ASSET_ROOT=""
BUCKET_URL=""
PROJECT_ID=""
EXPECTED_COMMIT=""
ACTIVE_OBJECT="catalog-release-state/active.json"
MAX_FORMS="1000"
HOSTING_EVIDENCE=""
LIVE_REPORT=""
BROWSER_REPORT=""
EXECUTE=0

usage() {
  cat <<'EOF'
Usage:
  bash scripts/deploy-form-catalog-release.sh \
    --manifest <release.json> \
    --asset-root <directory> \
    --bucket <gs://bucket> \
    --project <gcp-project> \
    [--action validate|stage|promote] \
    [--expected-commit <git-sha>] \
    [--active-object <object-path>] \
    [--max-forms <count>] \
    [--hosting-evidence <hosting.json>] \
    [--live-report <live-http-report.json>] \
    [--browser-report <browser-canary-report.json>] \
    [--execute]

The command is a dry run unless --execute is present.

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
    --live-report)
      LIVE_REPORT="${2:-}"
      shift 2
      ;;
    --browser-report)
      BROWSER_REPORT="${2:-}"
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
if [[ "${MANIFEST}" != /* ]]; then
  MANIFEST="${REPO_ROOT}/${MANIFEST}"
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
if [[ "${ACTION}" == "promote" ]]; then
  if [[ -z "${HOSTING_EVIDENCE}" || -z "${LIVE_REPORT}" || -z "${BROWSER_REPORT}" ]]; then
    echo "Promotion requires --hosting-evidence, --live-report, and --browser-report." >&2
    exit 1
  fi
  for evidence_var in HOSTING_EVIDENCE LIVE_REPORT BROWSER_REPORT; do
    evidence_path="${!evidence_var}"
    if [[ "${evidence_path}" != /* ]]; then
      printf -v "${evidence_var}" '%s/%s' "${REPO_ROOT}" "${evidence_path}"
    fi
  done
elif [[ -n "${HOSTING_EVIDENCE}" || -n "${LIVE_REPORT}" || -n "${BROWSER_REPORT}" ]]; then
  echo "Promotion evidence arguments are only valid with --action promote." >&2
  exit 1
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
TMP_SNAPSHOT_ROOT="$(mktemp -d)"
TMP_MANIFEST_SNAPSHOT="$(mktemp)"
TMP_REMOTE_POINTER="$(mktemp)"
TMP_NEW_POINTER="$(mktemp)"
cleanup() {
  rm -f \
    "${TMP_VALIDATION_JSON}" \
    "${TMP_VALIDATED_PLAN}" \
    "${TMP_UPLOAD_PLAN}" \
    "${TMP_MANIFEST_SNAPSHOT}" \
    "${TMP_REMOTE_POINTER}" \
    "${TMP_NEW_POINTER}" || true
  rm -rf "${TMP_SNAPSHOT_ROOT}" || true
}
trap cleanup EXIT

cp -- "${MANIFEST}" "${TMP_MANIFEST_SNAPSHOT}"
chmod 0444 "${TMP_MANIFEST_SNAPSHOT}"
MANIFEST="${TMP_MANIFEST_SNAPSHOT}"

VALIDATOR_ARGS=(
  --manifest "${MANIFEST}"
  --asset-root "${ASSET_ROOT}"
  --max-forms "${MAX_FORMS}"
)
if [[ "${ACTION}" == "promote" ]]; then
  VALIDATOR_ARGS+=(
    --hosting-evidence "${HOSTING_EVIDENCE}"
    --live-report "${LIVE_REPORT}"
    --browser-report "${BROWSER_REPORT}"
  )
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
HOSTING_VERSION=""
ROLLBACK_HOSTING_VERSION=""
HOSTING_EVIDENCE_SHA256=""
LIVE_REPORT_SHA256=""
BROWSER_REPORT_SHA256=""
SAMPLE_PLAN_SHA256=""
if [[ "${ACTION}" == "promote" ]]; then
  HOSTING_VERSION="$(validation_field promotionEvidence.hostingVersion)"
  ROLLBACK_HOSTING_VERSION="$(validation_field promotionEvidence.rollbackHostingVersion)"
  HOSTING_EVIDENCE_SHA256="$(validation_field promotionEvidence.hostingEvidenceSha256)"
  LIVE_REPORT_SHA256="$(validation_field promotionEvidence.liveReportSha256)"
  BROWSER_REPORT_SHA256="$(validation_field promotionEvidence.browserReportSha256)"
  SAMPLE_PLAN_SHA256="$(validation_field promotionEvidence.samplePlanSha256)"
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

if [[ "${EXECUTE}" == "1" ]]; then
  if ! command -v gcloud >/dev/null 2>&1; then
    echo "gcloud is required with --execute." >&2
    exit 1
  fi
  gcloud storage buckets describe "${BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --format='value(name)' >/dev/null
fi

print_command() {
  printf '+'
  printf ' %q' "$@"
  printf '\n'
}

run_command() {
  if [[ "${EXECUTE}" == "1" ]]; then
    "$@"
  else
    print_command "$@"
  fi
}

verify_remote_object() {
  local object_path="$1"
  local expected_content_type="$2"
  local expected_sha256="$3"
  local expected_bytes="$4"
  local expected_kind="$5"
  local expected_md5="$6"
  local object_url="${BUCKET_URL}/${object_path}"

  if [[ "${EXECUTE}" == "0" ]]; then
    echo "+ verify ${object_url} contentType=${expected_content_type} bytes=${expected_bytes} sha256=${expected_sha256} providerMd5=${expected_md5}"
    return 0
  fi

  local remote_values
  remote_values="$(
    gcloud storage objects describe "${object_url}" \
      --project "${PROJECT_ID}" \
      --format='value(size,content_type,cache_control,md5_hash,custom_fields.catalog_sha256,custom_fields.catalog_release_id,custom_fields.catalog_source_commit,custom_fields.catalog_asset_kind)'
  )"
  local remote_bytes remote_content_type remote_cache_control
  local remote_md5 remote_sha256 remote_release_id remote_source_commit remote_kind
  IFS=$'\t' read -r \
    remote_bytes \
    remote_content_type \
    remote_cache_control \
    remote_md5 \
    remote_sha256 \
    remote_release_id \
    remote_source_commit \
    remote_kind <<< "${remote_values}"

  if [[ "${remote_bytes}" != "${expected_bytes}" ]]; then
    echo "Remote byte count mismatch for ${object_url}: ${remote_bytes} != ${expected_bytes}" >&2
    return 1
  fi
  if [[ "${remote_content_type}" != "${expected_content_type}" ]]; then
    echo "Remote content type mismatch for ${object_url}: ${remote_content_type}" >&2
    return 1
  fi
  if [[ "${remote_cache_control}" != "public,max-age=31536000,immutable" ]]; then
    echo "Remote cache policy mismatch for ${object_url}: ${remote_cache_control}" >&2
    return 1
  fi
  if [[ "${remote_md5}" != "${expected_md5}" ]]; then
    echo "Remote provider MD5 mismatch for ${object_url}." >&2
    return 1
  fi
  if [[ "${remote_sha256}" != "${expected_sha256}" ]]; then
    echo "Remote SHA-256 metadata mismatch for ${object_url}." >&2
    return 1
  fi
  if [[ "${remote_release_id}" != "${RELEASE_ID}" ]]; then
    echo "Remote release metadata mismatch for ${object_url}: ${remote_release_id}" >&2
    return 1
  fi
  if [[ "${remote_source_commit}" != "${SOURCE_COMMIT}" ]]; then
    echo "Remote source commit mismatch for ${object_url}: ${remote_source_commit}" >&2
    return 1
  fi
  if [[ "${remote_kind}" != "${expected_kind}" ]]; then
    echo "Remote asset kind mismatch for ${object_url}: ${remote_kind}" >&2
    return 1
  fi
}

stage_assets() {
  while IFS=$'\t' read -r source_path object_path content_type sha256 byte_count md5_base64; do
    [[ -z "${source_path}" ]] && continue
    local kind="thumbnail"
    if [[ "${content_type}" == "application/pdf" ]]; then
      kind="pdf"
    fi
    run_command \
      gcloud storage cp \
      "${source_path}" \
      "${BUCKET_URL}/${object_path}" \
      --project "${PROJECT_ID}" \
      --no-clobber \
      --content-md5 "${md5_base64}" \
      --content-type "${content_type}" \
      --cache-control "public,max-age=31536000,immutable" \
      --custom-metadata "catalog_sha256=${sha256},catalog_release_id=${RELEASE_ID},catalog_source_commit=${SOURCE_COMMIT},catalog_asset_kind=${kind}"
    verify_remote_object \
      "${object_path}" \
      "${content_type}" \
      "${sha256}" \
      "${byte_count}" \
      "${kind}" \
      "${md5_base64}"
  done < "${TMP_UPLOAD_PLAN}"
}

stage_manifest() {
  run_command \
    gcloud storage cp \
    "${MANIFEST}" \
    "${BUCKET_URL}/${MANIFEST_OBJECT}" \
    --project "${PROJECT_ID}" \
    --no-clobber \
    --content-md5 "${MANIFEST_MD5}" \
    --content-type "application/json" \
    --cache-control "public,max-age=31536000,immutable" \
    --custom-metadata "catalog_sha256=${MANIFEST_SHA256},catalog_release_id=${RELEASE_ID},catalog_source_commit=${SOURCE_COMMIT},catalog_asset_kind=release_manifest"
  verify_remote_object \
    "${MANIFEST_OBJECT}" \
    "application/json" \
    "${MANIFEST_SHA256}" \
    "${MANIFEST_BYTES}" \
    "release_manifest" \
    "${MANIFEST_MD5}"
}

verify_staged_release() {
  while IFS=$'\t' read -r _source_path object_path content_type sha256 byte_count md5_base64; do
    [[ -z "${object_path}" ]] && continue
    local kind="thumbnail"
    if [[ "${content_type}" == "application/pdf" ]]; then
      kind="pdf"
    fi
    verify_remote_object \
      "${object_path}" \
      "${content_type}" \
      "${sha256}" \
      "${byte_count}" \
      "${kind}" \
      "${md5_base64}"
  done < "${TMP_UPLOAD_PLAN}"

  verify_remote_object \
    "${MANIFEST_OBJECT}" \
    "application/json" \
    "${MANIFEST_SHA256}" \
    "${MANIFEST_BYTES}" \
    "release_manifest" \
    "${MANIFEST_MD5}"
}

if [[ "${ACTION}" == "stage" ]]; then
  stage_assets
  stage_manifest
  echo "Release ${RELEASE_ID} staged without changing the active release pointer."
  exit 0
fi

verify_staged_release

ACTIVE_URL="${BUCKET_URL}/${ACTIVE_OBJECT}"
if [[ "${EXECUTE}" == "0" ]]; then
  echo "+ require hostingVersion=${HOSTING_VERSION} rollbackHostingVersion=${ROLLBACK_HOSTING_VERSION}"
  echo "+ require release-bound HTTP and browser reports with validated artifact hashes"
  echo "+ compare ${ACTIVE_URL} releaseId with previousReleaseId=${PREVIOUS_RELEASE_ID:-<none>}"
  echo "+ conditionally update ${ACTIVE_URL} using its observed object generation"
  echo "Promotion dry run passed. The active pointer was not changed."
  exit 0
fi

ACTIVE_GENERATION=""
CURRENT_RELEASE_ID=""
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
  if [[ "${CURRENT_RELEASE_ID}" != "${PREVIOUS_RELEASE_ID}" ]]; then
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

python3 - \
  "${TMP_NEW_POINTER}" \
  "${RELEASE_ID}" \
  "${SOURCE_COMMIT}" \
  "${PREVIOUS_RELEASE_ID}" \
  "${MANIFEST_OBJECT}" \
  "${MANIFEST_SHA256}" \
  "${HOSTING_VERSION}" \
  "${ROLLBACK_HOSTING_VERSION}" \
  "${HOSTING_EVIDENCE_SHA256}" \
  "${LIVE_REPORT_SHA256}" \
  "${BROWSER_REPORT_SHA256}" \
  "${SAMPLE_PLAN_SHA256}" <<'PY'
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
    hosting_version,
    rollback_hosting_version,
    hosting_evidence_sha256,
    live_report_sha256,
    browser_report_sha256,
    sample_plan_sha256,
) = sys.argv[1:]
payload = {
    "schemaVersion": 1,
    "releaseId": release_id,
    "sourceCommit": source_commit,
    "previousReleaseId": previous_release_id or None,
    "manifestObject": manifest_object,
    "manifestSha256": manifest_sha256,
    "hostingVersion": hosting_version,
    "rollbackHostingVersion": rollback_hosting_version,
    "hostingEvidenceSha256": hosting_evidence_sha256,
    "liveReportSha256": live_report_sha256,
    "browserReportSha256": browser_report_sha256,
    "samplePlanSha256": sample_plan_sha256,
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
  --custom-metadata "catalog_release_id=${RELEASE_ID},catalog_source_commit=${SOURCE_COMMIT}"

gcloud storage cp "${ACTIVE_URL}" "${TMP_REMOTE_POINTER}" \
  --project "${PROJECT_ID}" >/dev/null
python3 - \
  "${TMP_REMOTE_POINTER}" \
  "${RELEASE_ID}" \
  "${SOURCE_COMMIT}" \
  "${MANIFEST_SHA256}" \
  "${HOSTING_VERSION}" \
  "${ROLLBACK_HOSTING_VERSION}" \
  "${HOSTING_EVIDENCE_SHA256}" \
  "${LIVE_REPORT_SHA256}" \
  "${BROWSER_REPORT_SHA256}" \
  "${SAMPLE_PLAN_SHA256}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
keys = (
    "releaseId",
    "sourceCommit",
    "manifestSha256",
    "hostingVersion",
    "rollbackHostingVersion",
    "hostingEvidenceSha256",
    "liveReportSha256",
    "browserReportSha256",
    "samplePlanSha256",
)
for key, expected in zip(keys, sys.argv[2:]):
    if payload.get(key) != expected:
        raise SystemExit(f"Active catalog release pointer {key} verification failed")
PY

echo "Promoted catalog release ${RELEASE_ID} from exact commit ${SOURCE_COMMIT} on hosting version ${HOSTING_VERSION}."
