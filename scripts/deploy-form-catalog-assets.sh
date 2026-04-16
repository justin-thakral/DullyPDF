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
cleanup() {
  rm -f "${TMP_CORS_FILE}" || true
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

PDF_COUNT="$(find "${CATALOG_ROOT}" -type f -name '*.pdf' | wc -l | tr -d ' ')"
WEBP_COUNT="$(find "${CATALOG_ROOT}" -type f -name '*.webp' | wc -l | tr -d ' ')"
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
gcloud storage rsync "${CATALOG_ROOT}" "${FORM_CATALOG_BUCKET_URL}" \
  --project "${PROJECT_ID}" \
  --recursive \
  --delete-unmatched-destination-objects \
  --exclude '.*\.(json|py|pyc|md|txt|mjs)$' \
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
