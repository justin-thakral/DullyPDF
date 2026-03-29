#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PYTHON_BIN="${REPO_ROOT}/backend/.venv/bin/python"
STATS_HOST="127.0.0.1"
STATS_PORT="${STATS_PORT:-5174}"
STATS_URL="http://${STATS_HOST}:${STATS_PORT}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Missing Python runtime: ${PYTHON_BIN}" >&2
  echo "Create the backend virtualenv first so uvicorn/FastAPI dependencies are available." >&2
  exit 1
fi

export PYTHONPATH="${REPO_ROOT}${PYTHONPATH:+:${PYTHONPATH}}"
export GOOGLE_CLOUD_PROJECT="dullypdf"
export GCLOUD_PROJECT="dullypdf"

echo "Starting local-only internal stats dashboard on ${STATS_URL}" >&2
echo "This tool reads Firestore project dullypdf directly with your local Google credentials." >&2
echo "If auth fails, run: gcloud auth application-default login" >&2

(
  sleep 2
  python3 -m webbrowser "${STATS_URL}" >/dev/null 2>&1 || true
) &

cd "${REPO_ROOT}"
exec "${PYTHON_BIN}" -m uvicorn internal_stats.server:app --host "${STATS_HOST}" --port "${STATS_PORT}"
