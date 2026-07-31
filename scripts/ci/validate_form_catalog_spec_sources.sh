#!/usr/bin/env bash
set -euo pipefail

python_bin="${FORM_CATALOG_PYTHON:-backend/.venv/bin/python}"
spec_root="${FORM_CATALOG_SPEC_ROOT:-form_catalog_specs/candidates}"
planning_root="${FORM_CATALOG_PLANNING_ROOT:-form_catalog_releases/planning}"
policy_registry="${FORM_CATALOG_QA_POLICY_REGISTRY:-form_catalog_releases/planning-qa-registry.json}"
report_root="${FORM_CATALOG_QA_REPORT_ROOT:-${RUNNER_TEMP:-tmp/form-catalog-factory}/form-catalog-selection-qa}"

if [[ ! -x "$python_bin" ]]; then
  echo "Form catalog Python runtime is not executable: ${python_bin}" >&2
  exit 1
fi
if [[ ! -d "$spec_root" ]]; then
  echo "Form catalog spec root does not exist: ${spec_root}" >&2
  exit 1
fi
if [[ ! -d "$planning_root" ]]; then
  echo "Form catalog planning root does not exist: ${planning_root}" >&2
  exit 1
fi
if [[ ! -f "$policy_registry" ]]; then
  echo "Form catalog QA policy registry does not exist: ${policy_registry}" >&2
  exit 1
fi

"$python_bin" -m scripts.form_catalog_factory validate-spec "$spec_root"

mkdir -p "$report_root"
"$python_bin" -m scripts.form_catalog_factory.planning_qa \
  --registry "$policy_registry" \
  --planning-root "$planning_root" \
  --spec-root "$spec_root" \
  --report-root "$report_root" \
  --repository-root .
