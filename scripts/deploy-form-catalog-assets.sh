#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dullypdf}"
FORM_CATALOG_BUCKET_URL="${FORM_CATALOG_BUCKET_URL:-}"
FORM_CATALOG_BUCKET_REGION="${FORM_CATALOG_BUCKET_REGION:-us-east4}"
FORM_CATALOG_ASSET_BASE="${VITE_FORM_CATALOG_ASSET_BASE:-}"
CATALOG_ROOT="${FORM_CATALOG_ROOT:-form_catalog}"

if [[ -z "${FORM_CATALOG_BUCKET_URL}" ]]; then
  echo "Missing FORM_CATALOG_BUCKET_URL." >&2
  exit 1
fi

if [[ -z "${FORM_CATALOG_ASSET_BASE}" ]]; then
  echo "Missing VITE_FORM_CATALOG_ASSET_BASE." >&2
  exit 1
fi

EXPECTED_ASSET_BASE="https://storage.googleapis.com/${FORM_CATALOG_BUCKET_URL#gs://}"
if [[ "${FORM_CATALOG_ASSET_BASE}" != "${EXPECTED_ASSET_BASE}" ]]; then
  echo "VITE_FORM_CATALOG_ASSET_BASE must equal ${EXPECTED_ASSET_BASE} (got ${FORM_CATALOG_ASSET_BASE})." >&2
  exit 1
fi

if [[ ! -d "${CATALOG_ROOT}" ]]; then
  # form_catalog/ is a large tree of generated thumbnails and PDFs that we keep
  # out of git (see .gitignore). When CI doesn't have a local copy, the assets
  # still live in the GCS bucket from a prior deploy, so the hosted frontend
  # continues serving them. Skip rather than fail.
  echo "Form catalog root '${CATALOG_ROOT}' not present; assuming bucket is already populated and skipping asset sync." >&2
  exit 0
fi

TMP_CORS_FILE="$(mktemp)"
TMP_SYNC_ROOT=""
cleanup() {
  rm -f "${TMP_CORS_FILE}" || true
  if [[ -n "${TMP_SYNC_ROOT}" ]]; then
    rm -rf "${TMP_SYNC_ROOT}" || true
  fi
}
trap cleanup EXIT

cat > "${TMP_CORS_FILE}" <<'EOF'
[
  {
    "origin": [
      "https://dullypdf.com",
      "https://www.dullypdf.com",
      "https://dullypdf.web.app",
      "https://dullypdf.firebaseapp.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173"
    ],
    "method": ["GET", "HEAD", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "Cache-Control", "ETag", "Last-Modified"],
    "maxAgeSeconds": 3600
  }
]
EOF

echo "Generating incremental form catalog thumbnails..."
python3 scripts/generate-form-catalog-thumbnails.py --catalog-root "${CATALOG_ROOT}"

MANIFEST_PATH="${CATALOG_ROOT}/manifest.json"
if [[ ! -f "${MANIFEST_PATH}" ]]; then
  echo "Missing ${MANIFEST_PATH}; cannot determine public catalog asset set." >&2
  exit 1
fi

echo "Staging manifest-listed form catalog assets..."
TMP_SYNC_ROOT="$(mktemp -d)"
python3 - "${CATALOG_ROOT}" "${TMP_SYNC_ROOT}" <<'PY'
import json
import os
import shutil
import sys
from pathlib import Path

catalog_root = Path(sys.argv[1]).resolve()
sync_root = Path(sys.argv[2]).resolve()
manifest = json.loads((catalog_root / "manifest.json").read_text())
forms = [
    entry
    for entry in manifest.get("forms", [])
    if entry.get("ok") is True and entry.get("section") and entry.get("filename")
]
missing: list[str] = []

for entry in forms:
    pdf_path = catalog_root / entry["section"] / entry["filename"]
    webp_path = pdf_path.with_suffix(".webp")
    for source_path in (pdf_path, webp_path):
        if not source_path.is_file():
            missing.append(str(source_path.relative_to(catalog_root)))
            continue
        destination_path = sync_root / source_path.relative_to(catalog_root)
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(source_path, destination_path)
        except OSError:
            shutil.copy2(source_path, destination_path)

if missing:
    for rel_path in missing[:25]:
        print(f"Missing manifest asset: {rel_path}", file=sys.stderr)
    if len(missing) > 25:
        print(f"... {len(missing) - 25} more missing manifest assets", file=sys.stderr)
    raise SystemExit(1)

print(f"Staged {len(forms)} PDFs and {len(forms)} thumbnails from manifest.json")
PY

PDF_COUNT="$(find "${TMP_SYNC_ROOT}" -type f -name '*.pdf' | wc -l | tr -d ' ')"
WEBP_COUNT="$(find "${TMP_SYNC_ROOT}" -type f -name '*.webp' | wc -l | tr -d ' ')"
if [[ "${PDF_COUNT}" != "${WEBP_COUNT}" ]]; then
  echo "Thumbnail generation incomplete: pdfs=${PDF_COUNT} webp=${WEBP_COUNT}" >&2
  exit 1
fi

if ! gcloud storage buckets describe "${FORM_CATALOG_BUCKET_URL}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "Creating public form catalog bucket ${FORM_CATALOG_BUCKET_URL} in ${FORM_CATALOG_BUCKET_REGION}..."
  gcloud storage buckets create "${FORM_CATALOG_BUCKET_URL}" \
    --project "${PROJECT_ID}" \
    --location "${FORM_CATALOG_BUCKET_REGION}" \
    --default-storage-class STANDARD \
    --uniform-bucket-level-access \
    --no-public-access-prevention
fi

echo "Applying bucket policy and CORS..."
gcloud storage buckets update "${FORM_CATALOG_BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --uniform-bucket-level-access \
  --no-public-access-prevention \
  --cors-file "${TMP_CORS_FILE}"

gcloud storage buckets add-iam-policy-binding "${FORM_CATALOG_BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --member allUsers \
  --role roles/storage.objectViewer >/dev/null

echo "Syncing PDFs and thumbnails to ${FORM_CATALOG_BUCKET_URL}..."
gcloud storage rsync "${TMP_SYNC_ROOT}" "${FORM_CATALOG_BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --exclude '.*\.(json|py|pyc|md|txt|mjs|log)$' \
  --cache-control 'public,max-age=31536000,immutable'

if command -v gsutil >/dev/null 2>&1; then
  echo "Normalizing uploaded object metadata..."
  gsutil -m setmeta \
    -h 'Cache-Control:public,max-age=31536000,immutable' \
    -h 'Content-Type:application/pdf' \
    "${FORM_CATALOG_BUCKET_URL}/**/*.pdf"
  gsutil -m setmeta \
    -h 'Cache-Control:public,max-age=31536000,immutable' \
    -h 'Content-Type:image/webp' \
    "${FORM_CATALOG_BUCKET_URL}/**/*.webp"
else
  echo "Warning: gsutil not found; uploaded catalog thumbnails may keep default object content types." >&2
fi

echo "Form catalog assets deployed to ${FORM_CATALOG_ASSET_BASE}"
