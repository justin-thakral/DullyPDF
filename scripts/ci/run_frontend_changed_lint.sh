#!/usr/bin/env bash
set -euo pipefail

changed_files="${CHANGED_FRONTEND_LINT_FILES:-}"
if [[ -z "${changed_files}" ]]; then
  echo "No changed frontend source files to lint."
  exit 0
fi

mapfile -t lint_targets < <(
  printf '%s\n' "${changed_files}" \
    | tr ' ' '\n' \
    | sed '/^$/d' \
    | while IFS= read -r path; do
        if [[ -f "${path}" ]]; then
          printf '%s\n' "${path}"
        fi
      done
)

if [[ "${#lint_targets[@]}" -eq 0 ]]; then
  echo "No existing changed frontend source files to lint."
  exit 0
fi

echo "Linting changed frontend files:"
printf '  %s\n' "${lint_targets[@]}"

(cd frontend && npx eslint -- "${lint_targets[@]/#frontend\//}")
