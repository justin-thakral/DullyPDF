#!/usr/bin/env bash
set -euo pipefail

ACTION=""
BUCKET_URL=""
PROJECT_ID=""
OWNER=""
STATE_FILE=""
LOCK_OBJECT="catalog-release-state/production-deployment.lock"
WAIT_SECONDS="3900"
LEASE_SECONDS="7200"
POLL_SECONDS="5"
MINIMUM_REMAINING_SECONDS="0"

usage() {
  cat <<'EOF'
Usage:
  bash scripts/form-catalog-production-lock.sh \
    --action acquire|verify|release \
    --bucket <gs://bucket> \
    --project <gcp-project> \
    --owner <unique-owner-token> \
    --state-file <local-json-path> \
    [--lock-object <object-path>] \
    [--wait-seconds <seconds>] \
    [--lease-seconds <seconds>] \
    [--poll-seconds <seconds>] \
    [--minimum-remaining-seconds <seconds>]

The lock is an atomic create-only GCS object. Release and stale takeover both
require the exact observed object generation and owner. A stale lock is removed
only after its recorded expiry, using a generation-match delete.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --action)
      ACTION="${2:-}"
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
    --owner)
      OWNER="${2:-}"
      shift 2
      ;;
    --state-file)
      STATE_FILE="${2:-}"
      shift 2
      ;;
    --lock-object)
      LOCK_OBJECT="${2:-}"
      shift 2
      ;;
    --wait-seconds)
      WAIT_SECONDS="${2:-}"
      shift 2
      ;;
    --lease-seconds)
      LEASE_SECONDS="${2:-}"
      shift 2
      ;;
    --poll-seconds)
      POLL_SECONDS="${2:-}"
      shift 2
      ;;
    --minimum-remaining-seconds)
      MINIMUM_REMAINING_SECONDS="${2:-}"
      shift 2
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

if [[ "${ACTION}" != "acquire" \
  && "${ACTION}" != "verify" \
  && "${ACTION}" != "release" ]]; then
  echo "--action must be acquire, verify, or release." >&2
  exit 1
fi
if [[ ! "${BUCKET_URL}" =~ ^gs://[a-z0-9][a-z0-9._-]+$ ]]; then
  echo "--bucket must be a bucket-only gs:// URL." >&2
  exit 1
fi
if [[ ! "${PROJECT_ID}" =~ ^[a-z][a-z0-9-]{4,61}[a-z0-9]$ ]]; then
  echo "--project has an invalid Google Cloud project ID." >&2
  exit 1
fi
if [[ ! "${OWNER}" =~ ^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,199}$ ]]; then
  echo "--owner must be a normalized unique token." >&2
  exit 1
fi
if [[ -z "${STATE_FILE}" ]]; then
  echo "--state-file is required." >&2
  exit 1
fi
if [[ ! "${LOCK_OBJECT}" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]*$ ]] \
  || [[ "${LOCK_OBJECT}" == *".."* ]] \
  || [[ "${LOCK_OBJECT}" == /* ]]; then
  echo "--lock-object must be a normalized relative object path." >&2
  exit 1
fi
for value_name in WAIT_SECONDS LEASE_SECONDS POLL_SECONDS; do
  value="${!value_name}"
  if [[ ! "${value}" =~ ^[1-9][0-9]*$ ]]; then
    echo "${value_name,,} must be a positive integer." >&2
    exit 1
  fi
done
if [[ ! "${MINIMUM_REMAINING_SECONDS}" =~ ^(0|[1-9][0-9]*)$ ]]; then
  echo "minimum_remaining_seconds must be a non-negative integer." >&2
  exit 1
fi
if [[ "${ACTION}" != "verify" && "${MINIMUM_REMAINING_SECONDS}" != "0" ]]; then
  echo "--minimum-remaining-seconds is only valid with --action verify." >&2
  exit 1
fi

command -v gcloud >/dev/null 2>&1 || {
  echo "gcloud is required for the production deployment lock." >&2
  exit 1
}
command -v python3 >/dev/null 2>&1 || {
  echo "python3 is required for the production deployment lock." >&2
  exit 1
}

LOCK_URL="${BUCKET_URL}/${LOCK_OBJECT}"
TMP_PAYLOAD="$(mktemp)"
TMP_REMOTE="$(mktemp)"
TMP_STATE="$(mktemp)"
cleanup() {
  rm -f "${TMP_PAYLOAD}" "${TMP_REMOTE}" "${TMP_STATE}" || true
}
trap cleanup EXIT

read_lock_field() {
  local path="$1"
  local field="$2"
  python3 - "${path}" "${field}" <<'PY'
import json
import sys
from pathlib import Path

payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
value = payload.get(sys.argv[2])
if value is None:
    raise SystemExit(f"Lock state has no {sys.argv[2]}")
print(value)
PY
}

download_generation() {
  local expected_generation="$1"
  local before_generation after_generation
  before_generation="$(
    gcloud storage objects describe "${LOCK_URL}" \
      --project "${PROJECT_ID}" \
      --format='value(generation)' 2>/dev/null
  )" || return 1
  if [[ -z "${before_generation}" || "${before_generation}" != "${expected_generation}" ]]; then
    return 1
  fi
  gcloud storage cp "${LOCK_URL}" "${TMP_REMOTE}" \
    --project "${PROJECT_ID}" >/dev/null 2>&1 || return 1
  after_generation="$(
    gcloud storage objects describe "${LOCK_URL}" \
      --project "${PROJECT_ID}" \
      --format='value(generation)' 2>/dev/null
  )" || return 1
  [[ "${after_generation}" == "${expected_generation}" ]]
}

if [[ "${ACTION}" == "verify" || "${ACTION}" == "release" ]]; then
  if [[ ! -f "${STATE_FILE}" ]]; then
    echo "Lock state file does not exist: ${STATE_FILE}" >&2
    exit 1
  fi
  state_url="$(read_lock_field "${STATE_FILE}" objectUrl)"
  state_owner="$(read_lock_field "${STATE_FILE}" owner)"
  state_generation="$(read_lock_field "${STATE_FILE}" generation)"
  if [[ "${state_url}" != "${LOCK_URL}" || "${state_owner}" != "${OWNER}" ]]; then
    echo "Lock state does not belong to this object and owner." >&2
    exit 1
  fi
  if ! download_generation "${state_generation}"; then
    echo "Production lock generation changed before release." >&2
    exit 1
  fi
  remote_owner="$(read_lock_field "${TMP_REMOTE}" owner)"
  if [[ "${remote_owner}" != "${OWNER}" ]]; then
    echo "Production lock owner changed before ${ACTION}." >&2
    exit 1
  fi
  if [[ "${ACTION}" == "verify" ]]; then
    remote_expiry="$(read_lock_field "${TMP_REMOTE}" expiresEpoch)"
    now_epoch="$(date +%s)"
    if [[ ! "${remote_expiry}" =~ ^[0-9]+$ ]] \
      || (( remote_expiry <= now_epoch + MINIMUM_REMAINING_SECONDS )); then
      echo "Production lock does not have the required remaining lease time." >&2
      exit 1
    fi
    echo "Verified production deployment lock ${LOCK_URL} generation ${state_generation}."
    exit 0
  fi
  gcloud storage rm "${LOCK_URL}" \
    --project "${PROJECT_ID}" \
    --if-generation-match "${state_generation}" \
    --quiet
  rm -f "${STATE_FILE}"
  echo "Released production deployment lock ${LOCK_URL} generation ${state_generation}."
  exit 0
fi

mkdir -p "$(dirname "${STATE_FILE}")"
deadline="$(( $(date +%s) + WAIT_SECONDS ))"
while true; do
  now_epoch="$(date +%s)"
  expires_epoch="$(( now_epoch + LEASE_SECONDS ))"
  python3 - \
    "${TMP_PAYLOAD}" \
    "${LOCK_URL}" \
    "${OWNER}" \
    "${now_epoch}" \
    "${expires_epoch}" <<'PY'
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

output, object_url, owner, created_epoch, expires_epoch = sys.argv[1:]

def timestamp(epoch: str) -> str:
    return (
        datetime.fromtimestamp(int(epoch), tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )

payload = {
    "schemaVersion": 1,
    "lockType": "dullypdf-production-deployment",
    "objectUrl": object_url,
    "owner": owner,
    "createdAt": timestamp(created_epoch),
    "createdEpoch": int(created_epoch),
    "expiresAt": timestamp(expires_epoch),
    "expiresEpoch": int(expires_epoch),
}
Path(output).write_text(
    json.dumps(payload, indent=2, sort_keys=True) + "\n",
    encoding="utf-8",
)
PY

  if gcloud storage cp "${TMP_PAYLOAD}" "${LOCK_URL}" \
    --project "${PROJECT_ID}" \
    --if-generation-match=0 \
    --content-type "application/json" \
    --cache-control "no-store,max-age=0" \
    --custom-metadata "lock_owner=${OWNER},lock_expires_epoch=${expires_epoch}" \
    --quiet >/dev/null 2>&1; then
    generation="$(
      gcloud storage objects describe "${LOCK_URL}" \
        --project "${PROJECT_ID}" \
        --format='value(generation)'
    )"
    if [[ -z "${generation}" ]] || ! download_generation "${generation}"; then
      echo "Could not verify the newly acquired production lock." >&2
      exit 1
    fi
    if [[ "$(read_lock_field "${TMP_REMOTE}" owner)" != "${OWNER}" ]]; then
      echo "Newly acquired production lock has an unexpected owner." >&2
      exit 1
    fi
    python3 - \
      "${TMP_STATE}" \
      "${LOCK_URL}" \
      "${OWNER}" \
      "${generation}" \
      "${now_epoch}" \
      "${expires_epoch}" <<'PY'
import json
import sys
from pathlib import Path

output, object_url, owner, generation, created_epoch, expires_epoch = sys.argv[1:]
Path(output).write_text(
    json.dumps(
        {
            "schemaVersion": 1,
            "objectUrl": object_url,
            "owner": owner,
            "generation": generation,
            "createdEpoch": int(created_epoch),
            "expiresEpoch": int(expires_epoch),
        },
        indent=2,
        sort_keys=True,
    )
    + "\n",
    encoding="utf-8",
)
PY
    mv -f "${TMP_STATE}" "${STATE_FILE}"
    echo "Acquired production deployment lock ${LOCK_URL} generation ${generation}."
    exit 0
  fi

  current_generation="$(
    gcloud storage objects describe "${LOCK_URL}" \
      --project "${PROJECT_ID}" \
      --format='value(generation)' 2>/dev/null
  )" || current_generation=""
  if [[ -n "${current_generation}" ]] \
    && download_generation "${current_generation}"; then
    current_owner="$(read_lock_field "${TMP_REMOTE}" owner)"
    current_expiry="$(read_lock_field "${TMP_REMOTE}" expiresEpoch)"
    if [[ "${current_expiry}" =~ ^[0-9]+$ ]] \
      && (( current_expiry <= now_epoch )); then
      echo "Removing expired production lock owned by ${current_owner} at generation ${current_generation}."
      if gcloud storage rm "${LOCK_URL}" \
        --project "${PROJECT_ID}" \
        --if-generation-match "${current_generation}" \
        --quiet >/dev/null 2>&1; then
        continue
      fi
    fi
  fi

  if (( now_epoch >= deadline )); then
    echo "Timed out waiting for production deployment lock ${LOCK_URL}." >&2
    exit 1
  fi
  sleep "${POLL_SECONDS}"
done
