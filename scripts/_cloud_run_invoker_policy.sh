#!/usr/bin/env bash

cloud_run_write_desired_invoker_policy() {
  local policy_path="$1"
  local allowed_member="$2"

  python3 - <<'PY' "$policy_path" "$allowed_member"
import json
import sys

policy_path = sys.argv[1]
allowed_member = sys.argv[2]

with open(policy_path, "r", encoding="utf-8") as handle:
    policy = json.load(handle)

bindings = [
    binding
    for binding in policy.get("bindings", [])
    if binding.get("role") != "roles/run.invoker"
]
bindings.append({"role": "roles/run.invoker", "members": [allowed_member]})
policy["bindings"] = bindings

with open(policy_path, "w", encoding="utf-8") as handle:
    json.dump(policy, handle)
PY
}

cloud_run_invoker_policy_is_acceptable() {
  local policy_path="$1"
  local allowed_member="$2"

  python3 - <<'PY' "$policy_path" "$allowed_member"
import json
import sys

policy_path = sys.argv[1]
allowed_member = sys.argv[2]

with open(policy_path, "r", encoding="utf-8") as handle:
    policy = json.load(handle)

members = []
for binding in policy.get("bindings", []):
    if binding.get("role") == "roles/run.invoker":
        members.extend(binding.get("members") or [])

member_set = set(members)
if allowed_member == "allUsers":
    raise SystemExit(0 if "allUsers" in member_set else 1)

if allowed_member not in member_set:
    raise SystemExit(1)
if "allUsers" in member_set:
    raise SystemExit(1)
raise SystemExit(0)
PY
}

project_member_has_role() {
  local project_id="$1"
  local member="$2"
  local role="$3"
  local policy_path=""

  policy_path="$(mktemp)"
  if ! gcloud projects get-iam-policy "$project_id" --format=json > "$policy_path"; then
    rm -f "$policy_path"
    return 1
  fi

  python3 - <<'PY' "$policy_path" "$member" "$role"
import json
import sys

policy_path = sys.argv[1]
member = sys.argv[2]
role = sys.argv[3]

with open(policy_path, "r", encoding="utf-8") as handle:
    policy = json.load(handle)

for binding in policy.get("bindings", []):
    if binding.get("role") != role:
        continue
    members = set(binding.get("members") or [])
    if member in members:
        raise SystemExit(0)

raise SystemExit(1)
PY
  local status=$?
  rm -f "$policy_path"
  return "$status"
}

cloud_run_reset_invoker_policy() {
  local service_name="$1"
  local region="$2"
  local project_id="$3"
  local allowed_member="$4"
  local allow_permission_denied_fallback="${5:-false}"
  local allow_project_invoker_fallback="${6:-false}"
  local policy_path=""
  local err_path=""

  policy_path="$(mktemp)"
  err_path="$(mktemp)"

  if ! gcloud run services get-iam-policy "$service_name" \
    --region "$region" \
    --project "$project_id" \
    --format=json > "$policy_path"; then
    rm -f "$policy_path" "$err_path"
    return 1
  fi

  cloud_run_write_desired_invoker_policy "$policy_path" "$allowed_member"

  if gcloud run services set-iam-policy "$service_name" "$policy_path" \
    --region "$region" \
    --project "$project_id" \
    --quiet >/dev/null 2>"$err_path"; then
    rm -f "$policy_path" "$err_path"
    return 0
  fi

  if [[ "$allow_permission_denied_fallback" == "true" ]] \
    && grep -q "PERMISSION_DENIED" "$err_path"; then
    if gcloud run services get-iam-policy "$service_name" \
      --region "$region" \
      --project "$project_id" \
      --format=json > "$policy_path" \
      && cloud_run_invoker_policy_is_acceptable "$policy_path" "$allowed_member"; then
      echo "Warning: unable to reset Cloud Run invoker policy for ${service_name}; leaving the existing acceptable binding in place." >&2
      rm -f "$policy_path" "$err_path"
      return 0
    fi
    if [[ "$allow_project_invoker_fallback" == "true" ]] \
      && project_member_has_role "$project_id" "$allowed_member" "roles/run.invoker"; then
      echo "Warning: unable to reset Cloud Run invoker policy for ${service_name}; relying on existing project-level run.invoker access for ${allowed_member}." >&2
      rm -f "$policy_path" "$err_path"
      return 0
    fi
  fi

  cat "$err_path" >&2
  rm -f "$policy_path" "$err_path"
  return 1
}
