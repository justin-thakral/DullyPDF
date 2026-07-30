#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dullypdf}"
ALLOW_NON_PROD="${DULLYPDF_ALLOW_NON_PROD:-}"
MODE="prod"
OVERRIDE_FILE="${ENV_FILE:-}"
ENV_FILE="frontend/.env.local"
FIREBASE_HOSTING_DEPLOY_RESULT_PATH="${FIREBASE_HOSTING_DEPLOY_RESULT_PATH:-}"
CRITICAL_WEBP_ASSETS=(
  "/DullyPDF_logo_social_full_bleed.webp"
  "/demo/mobile-raw-pdf.webp"
  "/demo/mobile-commonforms.webp"
  "/demo/mobile-inspector.webp"
  "/demo/mobile-field-list.webp"
  "/demo/mobile-rename-remap.webp"
  "/demo/mobile-filled.webp"
)
CRITICAL_DEMO_ASSETS=(
  "/demo/new_patient_forms_1915ccb015.pdf|application/pdf"
  "/demo/baseFieldDetections.pdf|application/pdf"
  "/demo/openAiRename.pdf|application/pdf"
  "/demo/openAiRemap.pdf|application/pdf"
  "/demo/new_patient_forms_1915ccb015_mock.csv|text/csv"
  "/demo/generated/baseFieldDetections.fields.json|application/json"
  "/demo/generated/baseToOpenAiRenameNameMap.json|application/json"
  "/demo/generated/baseToOpenAiRemapNameMap.json|application/json"
)

if [[ "$PROJECT_ID" != "dullypdf" && -z "$ALLOW_NON_PROD" ]]; then
  echo "Refusing to deploy frontend to non-prod project: $PROJECT_ID. Set DULLYPDF_ALLOW_NON_PROD=1 to override." >&2
  exit 1
fi

if [[ -n "$OVERRIDE_FILE" ]]; then
  FRONTEND_ENV_OVERRIDE_FILE="$OVERRIDE_FILE" bash scripts/use-frontend-env.sh "$MODE"
else
  bash scripts/use-frontend-env.sh "$MODE"
fi

set -a
source "$ENV_FILE"
set +a

require_exact() {
  local name="$1"
  local expected="$2"
  local actual="${!name:-}"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected $name=$expected (got '${actual}')." >&2
    exit 1
  fi
}

require_nonempty() {
  local name="$1"
  local actual="${!name:-}"
  if [[ -z "$actual" ]]; then
    echo "Missing required $name in $ENV_FILE." >&2
    exit 1
  fi
}

require_empty() {
  local name="$1"
  local actual="${!name:-}"
  if [[ -n "$actual" ]]; then
    echo "Expected $name to be empty for prod builds." >&2
    exit 1
  fi
}

require_file() {
  local path="$1"
  if [[ ! -f "$path" ]]; then
    echo "Missing required file: $path" >&2
    exit 1
  fi
}

require_file_contains() {
  local path="$1"
  local needle="$2"
  if ! grep -Fq "$needle" "$path"; then
    echo "Expected $path to contain: $needle" >&2
    exit 1
  fi
}

verify_production_hosting_mutation_lock() {
  if [[ "$PROJECT_ID" != "dullypdf" ]]; then
    return 0
  fi
  local lock_owner="${FORM_CATALOG_PRODUCTION_LOCK_OWNER:-}"
  local lock_state="${FORM_CATALOG_PRODUCTION_LOCK_STATE_PATH:-}"
  if [[ -z "$lock_owner" || -z "$lock_state" ]]; then
    echo "Production Hosting deploy requires the shared lock owner and state path." >&2
    exit 1
  fi
  require_file "$lock_state"
  bash scripts/form-catalog-production-lock.sh \
    --action verify \
    --bucket gs://dullypdf-form-catalog-assets-east4 \
    --project dullypdf \
    --owner "$lock_owner" \
    --state-file "$lock_state" \
    --minimum-remaining-seconds 300
}

check_remote_content_type() {
  local url="$1"
  local expected_prefix="$2"
  local content_type
  if ! content_type="$(curl -fsSL -o /dev/null -w '%{content_type}' "$url")"; then
    echo "Failed to fetch $url for content-type validation." >&2
    exit 1
  fi
  if [[ "$content_type" != "$expected_prefix"* ]]; then
    echo "Unexpected content type for $url: ${content_type:-<empty>} (expected prefix: $expected_prefix)." >&2
    exit 1
  fi
}

check_remote_status() {
  local url="$1"
  local expected_status="$2"
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$status" != "$expected_status" ]]; then
    echo "Unexpected HTTP status for $url: $status (expected $expected_status)." >&2
    exit 1
  fi
}

check_remote_status_not() {
  local url="$1"
  local disallowed_status="$2"
  local status
  status="$(curl -s -o /dev/null -w '%{http_code}' "$url")"
  if [[ "$status" == "$disallowed_status" ]]; then
    echo "Unexpected HTTP status for $url: $status is disallowed." >&2
    exit 1
  fi
}

check_remote_body_contains() {
  local url="$1"
  local needle="$2"
  local body
  if ! body="$(curl -fsSL "$url")"; then
    echo "Failed to fetch $url for body validation." >&2
    exit 1
  fi
  if ! grep -Fq "$needle" <<<"$body"; then
    echo "Expected $url body to contain: $needle" >&2
    exit 1
  fi
}

check_remote_body_not_contains() {
  local url="$1"
  local needle="$2"
  local body
  if ! body="$(curl -fsSL "$url")"; then
    echo "Failed to fetch $url for body validation." >&2
    exit 1
  fi
  if grep -Fq "$needle" <<<"$body"; then
    echo "Expected $url body to not contain: $needle" >&2
    exit 1
  fi
}

check_remote_cors_origin() {
  local url="$1"
  local origin="$2"
  local header
  if ! header="$(curl -fsSI -H "Origin: ${origin}" "$url" | tr -d '\r' | awk -F': ' 'tolower($1)=="access-control-allow-origin"{print $2; exit}')"; then
    echo "Failed to fetch $url for CORS validation." >&2
    exit 1
  fi
  if [[ "$header" != "$origin" && "$header" != "*" ]]; then
    echo "Unexpected Access-Control-Allow-Origin for $url: ${header:-<empty>} (expected ${origin} or *)." >&2
    exit 1
  fi
}

require_nonempty VITE_API_URL
require_nonempty VITE_DETECTION_API_URL
require_nonempty VITE_FIREBASE_PROJECT_ID
require_nonempty VITE_FORM_CATALOG_ASSET_BASE
require_nonempty FORM_CATALOG_BUCKET_URL

if [[ "${VITE_API_URL}" == *"localhost"* || "${VITE_API_URL}" == *"127.0.0.1"* ]]; then
  echo "VITE_API_URL must point to prod backend, not localhost." >&2
  exit 1
fi

if [[ "${VITE_API_URL}" == *".run.app"* ]]; then
  echo "VITE_API_URL must point to the public app origin, not a direct Cloud Run URL." >&2
  exit 1
fi

if [[ "${VITE_DETECTION_API_URL}" == *"localhost"* || "${VITE_DETECTION_API_URL}" == *"127.0.0.1"* ]]; then
  echo "VITE_DETECTION_API_URL must point to prod backend, not localhost." >&2
  exit 1
fi

if [[ "${VITE_DETECTION_API_URL}" == *".run.app"* ]]; then
  echo "VITE_DETECTION_API_URL must point to the public app origin, not a direct Cloud Run URL." >&2
  exit 1
fi

if [[ "$VITE_FIREBASE_PROJECT_ID" != "$PROJECT_ID" ]]; then
  echo "VITE_FIREBASE_PROJECT_ID must match $PROJECT_ID for prod deploys." >&2
  exit 1
fi
require_exact VITE_FIREBASE_AUTH_DOMAIN "${PROJECT_ID}.firebaseapp.com"

require_empty VITE_ADMIN_TOKEN

if [[ "${VITE_CONTACT_REQUIRE_RECAPTCHA:-true}" == "true" || "${VITE_SIGNUP_REQUIRE_RECAPTCHA:-true}" == "true" ]]; then
  require_nonempty VITE_RECAPTCHA_SITE_KEY
fi

require_file_contains "firebase.json" "https://apis.google.com"
require_file_contains "firebase.json" "https://${PROJECT_ID}.firebaseapp.com"
if [[ -n "${VITE_GOOGLE_ADS_TAG_ID:-}" ]]; then
  require_file_contains "firebase.json" "https://googleads.g.doubleclick.net"
fi

if command -v convert >/dev/null 2>&1; then
  bash scripts/convert-webp-assets.sh
else
  echo "Warning: ImageMagick 'convert' not found; skipping auto-generation and relying on committed WebP assets." >&2
fi

if [[ -d form_catalog ]]; then
  echo "Rebuilding form catalog manifest from local PDFs..."
  python3 scripts/rebuild-form-catalog-manifest.py --catalog-root form_catalog
fi

bash scripts/deploy-form-catalog-assets.sh

# Rebuild the form catalog index only when the scraper manifest is available
# locally. CI runners ship without form_catalog/ (gitignored local-only data)
# and rely on the already-committed formCatalogData.mjs + firebase.json.
if [[ -f form_catalog/manifest.json ]]; then
  echo "Rebuilding form catalog index (slugs + legacy redirects)..."
  node scripts/build-form-catalog-index.mjs
  node scripts/merge-form-slug-redirects.mjs
else
  echo "Skipping form catalog index rebuild (form_catalog/manifest.json not present; using committed formCatalogData.mjs + firebase.json)."
fi

# Production Hosting must be built from the exact tracked cumulative activation
# mapping verified before the shared deployment lock was acquired. Recomputing
# this deterministic report immediately before Vite also catches a local
# form_catalog rebuild that changed the generated module after the preflight.
if [[ "$PROJECT_ID" == "dullypdf" ]]; then
  require_exact FORM_CATALOG_REQUIRE_ACTIVE_MAPPING "1"
  require_nonempty FORM_CATALOG_ACTIVE_MAPPING_EVIDENCE_PATH
  require_file "$FORM_CATALOG_ACTIVE_MAPPING_EVIDENCE_PATH"
  ACTIVE_MAPPING_RECHECK_PATH="$(mktemp)"
  active_mapping_args=(
    --active-release form_catalog_releases/active.json
    --form-catalog-data frontend/src/config/formCatalogData.mjs
    --repo-root .
    --expected-report "$FORM_CATALOG_ACTIVE_MAPPING_EVIDENCE_PATH"
    --output "$ACTIVE_MAPPING_RECHECK_PATH"
  )
  active_replacement_count="$(
    jq -r '.replacements | length' form_catalog_releases/active.json
  )"
  if [[ "$active_replacement_count" != "0" ]]; then
    require_nonempty FORM_CATALOG_RELEASE_MANIFEST_PATH
    require_file "$FORM_CATALOG_RELEASE_MANIFEST_PATH"
    active_mapping_args+=(
      --manifest "$FORM_CATALOG_RELEASE_MANIFEST_PATH"
    )
  fi
  python3 -m scripts.form_catalog_factory verify-active-mapping \
    "${active_mapping_args[@]}"
  rm -f "$ACTIVE_MAPPING_RECHECK_PATH"
fi

(
  cd frontend
  npm run build:prod
)

echo "Generating static HTML for SEO prerendering..."
node scripts/generate-static-html.mjs

echo "Generating sitemap..."
node scripts/generate-sitemap.mjs

echo "Generating blog RSS feed..."
node scripts/generate-rss.mjs

# Validate key static HTML files exist
require_file "frontend/dist/index.html"
require_file "frontend/dist/app-shell.html"
require_file "frontend/dist/workflows/index.html"
require_file "frontend/dist/industries/index.html"
require_file "frontend/dist/healthcare-pdf-automation/index.html"
require_file "frontend/dist/pdf-to-fillable-form/index.html"
require_file "frontend/dist/fill-pdf-from-csv/index.html"
require_file "frontend/dist/acord-form-automation/index.html"
require_file "frontend/dist/blog/index.html"
require_file "frontend/dist/blog/dullypdf-vs-anvil-pdf-automation-pricing/index.html"
require_file "frontend/dist/usage-docs/index.html"
require_file "frontend/dist/usage-docs/getting-started/index.html"
require_file "frontend/dist/es/usage-docs/index.html"
require_file "frontend/dist/forms/index.html"
require_file "frontend/dist/forms/w-9/index.html"
require_file "frontend/dist/sitemap.xml"
require_file "frontend/dist/sitemap-main.xml"
require_file "frontend/dist/sitemap-forms.xml"
require_file "frontend/dist/feed.xml"
require_file_contains "frontend/dist/fill-pdf-from-csv/index.html" '<meta name="robots" content="index,follow" />'
require_file_contains "frontend/dist/acord-form-automation/index.html" '<meta name="robots" content="index,follow" />'
require_file_contains "frontend/dist/blog/index.html" '<meta name="robots" content="index,follow" />'
require_file_contains "frontend/dist/usage-docs/index.html" '<link rel="canonical" href="https://dullypdf.com/usage-docs" />'
require_file_contains "frontend/dist/sitemap-main.xml" '<loc>https://dullypdf.com/fill-pdf-from-csv</loc>'
require_file_contains "frontend/dist/sitemap-main.xml" '<loc>https://dullypdf.com/acord-form-automation</loc>'
require_file_contains "frontend/dist/sitemap-main.xml" '<loc>https://dullypdf.com/blog</loc>'
require_file_contains "frontend/dist/sitemap-main.xml" '<loc>https://dullypdf.com/usage-docs</loc>'
echo "Static HTML, sitemap, and feed validation passed."

for asset_path in "${CRITICAL_WEBP_ASSETS[@]}"; do
  require_file "frontend/dist${asset_path}"
done
for asset_spec in "${CRITICAL_DEMO_ASSETS[@]}"; do
  IFS='|' read -r asset_path _expected_content_type <<<"$asset_spec"
  require_file "frontend/dist${asset_path}"
done

# Revalidate the exact remote lock generation and lease at the final Hosting
# mutation boundary, after all potentially long build and prerender work.
verify_production_hosting_mutation_lock

if [[ -n "${FIREBASE_HOSTING_DEPLOY_RESULT_PATH}" ]]; then
  mkdir -p "$(dirname "${FIREBASE_HOSTING_DEPLOY_RESULT_PATH}")"
  firebase --json deploy --only hosting --project "$PROJECT_ID" \
    > "${FIREBASE_HOSTING_DEPLOY_RESULT_PATH}"
  python3 - "${FIREBASE_HOSTING_DEPLOY_RESULT_PATH}" <<'PY'
import json
import sys
from pathlib import Path

path = Path(sys.argv[1])
payload = json.loads(path.read_text(encoding="utf-8"))
hosting = (payload.get("result") or {}).get("hosting")
if payload.get("status") != "success" or not hosting:
    raise SystemExit("Firebase JSON deploy result did not contain a successful Hosting version")
if isinstance(hosting, list) and len(hosting) != 1:
    raise SystemExit("Firebase deploy returned more than one Hosting version")
print(f"Firebase Hosting deploy result captured at {path}")
PY
  if [[ "${FORM_CATALOG_CREATE_HOSTING_EVIDENCE:-0}" == "1" ]]; then
    for required_name in \
      FORM_CATALOG_HOSTING_BEFORE_PATH \
      FORM_CATALOG_HOSTING_EVIDENCE_PATH \
      FORM_CATALOG_ACTIVE_MAPPING_EVIDENCE_PATH \
      FORM_CATALOG_RELEASE_MANIFEST_PATH \
      GITHUB_SHA \
      GITHUB_RUN_ID \
      GITHUB_RUN_ATTEMPT; do
      if [[ -z "${!required_name:-}" ]]; then
        echo "Immediate catalog Hosting evidence requires ${required_name}." >&2
        exit 1
      fi
    done
    python3 -m scripts.form_catalog_factory create-hosting-evidence \
      --active-release form_catalog_releases/active.json \
      --active-mapping-evidence "$FORM_CATALOG_ACTIVE_MAPPING_EVIDENCE_PATH" \
      --form-catalog-data frontend/src/config/formCatalogData.mjs \
      --release-manifest "$FORM_CATALOG_RELEASE_MANIFEST_PATH" \
      --before-snapshot "$FORM_CATALOG_HOSTING_BEFORE_PATH" \
      --deploy-result "$FIREBASE_HOSTING_DEPLOY_RESULT_PATH" \
      --project dullypdf \
      --site dullypdf \
      --site-origin https://dullypdf.com \
      --site-origin https://dullypdf.web.app \
      --deployment-commit "$GITHUB_SHA" \
      --workflow-run-id "$GITHUB_RUN_ID" \
      --workflow-run-attempt "$GITHUB_RUN_ATTEMPT" \
      --output "$FORM_CATALOG_HOSTING_EVIDENCE_PATH"
  fi
else
  firebase deploy --only hosting --project "$PROJECT_ID"
fi

LIVE_BASE_URL="https://${PROJECT_ID}.web.app"
for asset_path in "${CRITICAL_WEBP_ASSETS[@]}"; do
  check_remote_content_type "${LIVE_BASE_URL}${asset_path}" "image/webp"
done
for asset_spec in "${CRITICAL_DEMO_ASSETS[@]}"; do
  IFS='|' read -r asset_path expected_content_type <<<"$asset_spec"
  check_remote_content_type "${LIVE_BASE_URL}${asset_path}" "$expected_content_type"
done

check_remote_status "${LIVE_BASE_URL}/fill-pdf-from-csv/" "301"
check_remote_body_contains "${LIVE_BASE_URL}/fill-pdf-from-csv" 'data-seo-jsonld="true"'
check_remote_body_not_contains "${LIVE_BASE_URL}/respond/token-1" 'homepage-shell'
check_remote_body_contains "${LIVE_BASE_URL}/respond/token-1" '<div id="root"></div>'
check_remote_body_not_contains "${LIVE_BASE_URL}/forms" 'homepage-shell'
check_remote_body_contains "${LIVE_BASE_URL}/forms" 'Form Catalog'
check_remote_body_contains "${LIVE_BASE_URL}/forms" 'data-seo-jsonld="true"'
check_remote_body_contains "${LIVE_BASE_URL}/forms" '<link rel="canonical" href="https://dullypdf.com/forms"'
check_remote_body_not_contains "${LIVE_BASE_URL}/forms/w-9" 'homepage-shell'
check_remote_body_contains "${LIVE_BASE_URL}/forms/w-9" 'W-9'
check_remote_body_contains "${LIVE_BASE_URL}/forms/w-9" 'data-seo-jsonld="true"'
check_remote_body_contains "${LIVE_BASE_URL}/forms/w-9" '<link rel="canonical" href="https://dullypdf.com/forms/w-9"'
check_remote_status "${LIVE_BASE_URL}/forms/w-9-w-9-fw9" "301"
check_remote_content_type "${VITE_FORM_CATALOG_ASSET_BASE}/hr_onboarding/w-9__fw9.pdf" "application/pdf"
check_remote_content_type "${VITE_FORM_CATALOG_ASSET_BASE}/hr_onboarding/w-9__fw9.webp" "image/webp"
check_remote_cors_origin "${VITE_FORM_CATALOG_ASSET_BASE}/hr_onboarding/w-9__fw9.pdf" "https://${PROJECT_ID}.web.app"
check_remote_status_not "${LIVE_BASE_URL}/this-path-should-not-exist" "200"

echo "Frontend deploy checks passed: critical WebP assets are present locally and served remotely as image/webp."
