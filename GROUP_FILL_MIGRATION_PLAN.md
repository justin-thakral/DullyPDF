# Group Fill Migration Plan

Migrate Search & Fill, Fill By Link, and API Fill to support **filling every PDF in a template group from a single input record**, gated behind an explicit "Fill all forms in this group" checkbox in each surface.

This document is the implementation-of-record. Every section is intended to be specific enough to execute against without further design work.

---

## 0. Goals, non-goals, and glossary

### Goals

- Introduce one shared primitive — a **canonical group schema** — that is the union of all unique fields across every template in a group.
- Wire that primitive into three surfaces:
  1. **Search & Fill from files** — CSV / Excel / JSON / TXT / stored respondent responses.
  2. **Fill By Link** — hosted respondent web form.
  3. **API Fill** — JSON-to-PDF REST endpoint.
- Add a **"Fill all forms in this group"** (or surface-equivalent) checkbox to each surface as the explicit opt-in toggle.
- Each surface, when in group mode, takes **one input record** and produces **N filled PDFs** (one per template in the group).
- Backwards-compatible: every existing single-template artifact continues to work unchanged.

### Non-goals (out of scope for this migration)

- Per-template overrides of the union schema (e.g. different value of the same canonical field in different templates).
- Conditional logic in the unified web form ("if marital_status = married then show spouse_name").
- A user-facing field-aliasing UI for manual merge/split. Lexical merge ships first; aliasing UI is a follow-up only if users complain.
- SQL as a data source for Search & Fill (see Open Question OQ-1).
- Schema reconciliation / auto-upgrade of existing partially-shipped group Fill By Link records (see Phase 6 — they get a "needs republish" prompt instead).

### Glossary

| Term | Definition |
|---|---|
| **Template** | A saved DullyPDF form with detected fields and a stable field schema. |
| **Group** | A named collection of templates. Existing concept; see `backend/firebaseDB/group_database.py` and `backend/api/routes/groups.py`. |
| **Canonical field key** | A normalized field name (snake_case, prefix-stripped, lowercased) used to merge equivalent fields across templates. |
| **Canonical group schema** | The deduped union of fields across all templates in a group, keyed by canonical field key, with per-template bindings. |
| **Schema snapshot** | A frozen copy of the canonical group schema embedded in a published Fill By Link record or API endpoint at publish time, so respondents and API consumers see a stable contract. |
| **Input record** | A flat dict of canonical key → value, regardless of source (CSV row, web form submission, API JSON body). |
| **Per-template binding** | The `(templateId, fieldId, fieldName)` triple that tells `apply_group_record` which physical field on which template a canonical key maps to. |
| **Group fill result** | A vector of per-template outcomes: `filled` / `errored` / `skipped`, each with PDF refs or error details. |

---

## 1. Architecture overview

One service module owns the merge logic. Three surfaces consume it. No surface duplicates the merge.

```
                ┌────────────────────────────────────────┐
                │   group_schema_service (new, Phase 1)  │
                │                                        │
                │  build_group_canonical_schema()        │
                │  build_group_canonical_json_schema()   │
                │  freeze_group_schema_snapshot()        │
                │  apply_group_record()                  │
                └─────────────┬──────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       │                      │                      │
       ▼                      ▼                      ▼
  ┌────────────┐        ┌────────────┐        ┌────────────┐
  │  Search &  │        │  Fill By   │        │  API Fill  │
  │  Fill grp  │        │  Link grp  │        │   group    │
  │  (Phase 2) │        │  (Phase 3) │        │  (Phase 4) │
  └────────────┘        └────────────┘        └────────────┘
       │                      │                      │
       └──────────────────────┴──────────────────────┘
                              │
                              ▼
                 existing single-template fill engine
                 (per-template fill, one PDF per call)
```

### Key reuse points

- `backend/services/fill_links_service.py` already contains `build_group_fill_link_questions(template_sources)` at line ~695. This must be **refactored to delegate to the new service** rather than duplicating the merge.
- `backend/api/routes/fill_links.py` already contains `_build_group_web_form_schema` at line ~251 and `_validate_group_template_sources`. Both must delegate.
- The existing per-template fill primitive (whatever the single-template Fill By Link materialization calls) is reused unchanged — `apply_group_record` is a loop on top of it.

### Decision summary (referenced throughout the plan)

| ID | Decision | Recommendation |
|---|---|---|
| **D1** | Type conflict on the same canonical key | Hard error at publish time (Fill By Link, API Fill); soft warning for ad-hoc Search & Fill. |
| **D2** | Required-field semantics across templates | Strictest wins. Required in any template → required in canonical. |
| **D3** | Multi-PDF response format | Default zip. `?format=merged` returns single concatenated PDF. `?format=json` returns base64 JSON envelope. |
| **D4** | "Fill all forms" checkbox semantics for Fill By Link group publish | Checkbox is required-on for any group publish. It's explicit consent UI, not a behavior toggle — there is no "publish a group link without unifying schema" mode. |
| **D5** | Template edited after publish | Snapshot stays frozen. Owner sees "republish required" banner. Existing close-on-update behavior (`_sync_group_fill_link_after_update`) preserved. |
| **D6** | API Fill JSON schema strictness | `additionalProperties: false`. Strict contract. |
| **D7** | Quota counting for group fills | Per-PDF. One group fill that materializes 7 PDFs counts as 7 fills. |
| **D8** | Pricing page treatment | Fold into existing "fills/month" with a footnote. No new line item. |

---

## 2. Phase 1 — Foundation: canonical group schema service

### 2.1 Files to add

| Path | Purpose |
|---|---|
| `backend/services/group_schema_service.py` | New module. Owns canonical schema construction, JSON schema generation, snapshot freezing, and `apply_group_record`. |
| `backend/test/unit/services/test_group_schema_service.py` | Unit tests for everything in the new module. |
| `backend/services/group_schema_types.py` | Pydantic models / TypedDicts for `GroupCanonicalSchema`, `GroupCanonicalField`, `GroupFillResult`, `GroupFillTemplateOutcome`. Kept separate so frontend type generation can mirror them. |

### 2.2 Files to modify

| Path | Change |
|---|---|
| `backend/services/fill_links_service.py` (line ~695, `build_group_fill_link_questions`) | Delegate to `group_schema_service.build_group_canonical_schema` then transform canonical fields → Fill By Link question shape. Delete duplicate merge logic. |
| `backend/api/routes/fill_links.py` (line ~251, `_build_group_web_form_schema`) | Same delegation. |
| `backend/api/routes/fill_links.py` (line ~310, `_validate_group_template_sources`) | After validation, call `freeze_group_schema_snapshot` and persist on the record. |

### 2.3 Public surface (function signatures)

```python
# backend/services/group_schema_service.py

from typing import Iterable, Mapping, Any, Optional
from backend.services.group_schema_types import (
    GroupCanonicalSchema,
    GroupCanonicalField,
    GroupFillResult,
    GroupFillTemplateOutcome,
    GroupSchemaWarning,
)


def build_group_canonical_schema(
    group_id: str,
    user_id: str,
    *,
    template_overrides: Optional[Iterable[Mapping[str, Any]]] = None,
) -> GroupCanonicalSchema:
    """
    Compute the canonical schema for a group.

    Loads the group, loads every template's saved field metadata, merges
    fields by canonical key, and returns the union schema.

    Pure with respect to inputs — does not mutate the database.

    Raises:
        GroupNotFoundError: group_id does not exist or is not owned by user_id.
        GroupSchemaTypeConflictError: two fields normalize to the same
            canonical key but have incompatible types (D1, hard mode).
    """


def build_group_canonical_json_schema(
    canonical_schema: GroupCanonicalSchema,
) -> dict:
    """
    Convert a canonical schema into a JSON Schema document for API Fill.

    Strict mode: additionalProperties is False (D6).
    Required array contains every canonical field whose `required` is True.
    Enum types map to JSON Schema `enum`. Booleans (checkboxes) map to
    `type: boolean`.
    """


def freeze_group_schema_snapshot(
    canonical_schema: GroupCanonicalSchema,
) -> dict:
    """
    Return a JSON-serializable snapshot dict to embed in published artifacts.

    The snapshot is self-contained: it does not require the source group to
    exist at apply-time. It carries every per-template binding by ID.
    """


def apply_group_record(
    group_id: str,
    record: Mapping[str, Any],
    user_id: str,
    *,
    snapshot: Optional[dict] = None,
    on_missing_field: str = "skip",  # "skip" | "error"
    on_template_error: str = "continue",  # "continue" | "abort"
) -> GroupFillResult:
    """
    Fill every template in the group from one record.

    For each template:
      1. Project `record` through the template's per-template bindings into
         a per-template fill payload.
      2. Call the existing single-template fill engine.
      3. Capture outcome (filled / errored / skipped) into the result vector.

    If `snapshot` is provided, use it instead of recomputing the canonical
    schema. Published artifacts MUST pass their stored snapshot so they are
    not affected by template drift.

    Returns the full result vector regardless of partial failures (when
    on_template_error="continue", the default).
    """
```

### 2.4 Data shapes

```python
# backend/services/group_schema_types.py

from typing import Literal, Optional, TypedDict


CanonicalFieldType = Literal[
    "text", "date", "checkbox", "radio_group", "signature", "number"
]


class PerTemplateBinding(TypedDict):
    templateId: str
    fieldId: str
    fieldName: str  # the post-rename field name on that specific template


class GroupCanonicalField(TypedDict):
    canonicalKey: str           # e.g. "patient_name"
    label: str                  # human-readable, derived from rename label
    type: CanonicalFieldType
    required: bool              # strictest across templates (D2)
    allowedValues: Optional[list[str]]   # for radio_group
    perTemplateBindings: list[PerTemplateBinding]
    sourceConfidence: float     # min rename confidence across bindings


class GroupSchemaWarning(TypedDict):
    code: Literal[
        "type_conflict_soft",
        "label_divergence",
        "low_confidence_merge",
        "orphan_field",
    ]
    canonicalKey: str
    detail: str


class GroupCanonicalSchema(TypedDict):
    groupId: str
    snapshotVersion: int        # bumps when source groups/templates change
    templateIds: list[str]
    fields: list[GroupCanonicalField]
    warnings: list[GroupSchemaWarning]
    builtAt: str                # ISO-8601


class GroupFillTemplateOutcome(TypedDict):
    templateId: str
    status: Literal["filled", "errored", "skipped"]
    pdfRef: Optional[str]       # GCS path or in-memory marker
    fieldsApplied: int
    fieldsSkipped: list[str]    # canonical keys with no value in record
    error: Optional[str]


class GroupFillResult(TypedDict):
    groupId: str
    snapshotVersion: int
    perTemplate: list[GroupFillTemplateOutcome]
    summary: dict  # {"filled": int, "errored": int, "skipped": int}
```

### 2.5 Canonical key derivation rules

Apply in order:

1. Start from the post-rename field name (the OpenAI rename output, not the original `commonforms_*` placeholder).
2. Lowercase.
3. Strip leading prefixes used by the rename pipeline: `i_`, `checkbox_`, `radio_`.
4. Replace runs of non-alphanumeric characters with a single underscore.
5. Strip leading/trailing underscores.
6. For checkbox group / option pairs (`{groupKey}_{optionKey}`), the canonical key is the **groupKey** alone, with the optionKey contributing to `allowedValues`. Do **not** create N canonical keys per checkbox option.

Two fields with the same canonical key after these rules merge into one canonical entry. Their per-template bindings are appended.

### 2.6 Type conflict handling (D1)

When two bindings collide on the same canonical key but have different `type`:

- **Hard mode** (used by `build_group_canonical_schema` when called by Fill By Link / API Fill publish): raise `GroupSchemaTypeConflictError(canonical_key, conflicting_types)`. The publish UI surfaces this as "Cannot publish — `marital_status` is a checkbox in Form A but a text field in Form B. Fix the field type in one of the templates and try again."
- **Soft mode** (used by `build_group_canonical_schema` when called by Search & Fill in workspace): emit a `GroupSchemaWarning` with code `type_conflict_soft`, drop the lower-confidence binding from `perTemplateBindings`, and continue. The workspace UI shows the warning above the result list.

The mode is selected by a kwarg `strict: bool = True` on `build_group_canonical_schema`.

### 2.7 Required-field semantics (D2)

A canonical field is marked `required: True` if **any** of its per-template bindings is required on its source template. This is intentional: the strictest wins, so respondents/API consumers cannot accidentally produce an under-filled PDF.

### 2.8 Caching

`build_group_canonical_schema` is pure over `(group, [templates])`. Cache by:

```
cache_key = (group_id, max(template.updated_at for template in group.templates))
```

In-process LRU cache, max 256 entries, no TTL (cache key handles invalidation). Skip the cache when `template_overrides` is provided.

### 2.9 Phase 1 QA

#### 2.9.1 Unit tests — `backend/test/unit/services/test_group_schema_service.py`

Each test gets a synthetic group fixture with 2–4 hand-built templates. No DB.

| Test name | What it asserts |
|---|---|
| `test_canonical_key_simple_merge` | Two templates each have a `patient_name` text field. Canonical schema has 1 field with both bindings. |
| `test_canonical_key_normalization_rules` | Templates have `Patient Name`, `patient_name`, `patient-name`, `i_patient_name` — all collapse to one canonical key `patient_name`. |
| `test_canonical_key_no_false_merge` | `patient_name` and `patient_full_name` stay separate. |
| `test_checkbox_group_option_merge` | Template A has `marital_status` checkboxes with options `single,married`, template B has options `married,divorced`. Canonical has one `marital_status` radio_group with `allowedValues = ["single","married","divorced"]`. |
| `test_required_strictest_wins` | Field required in A, optional in B → canonical required = True. |
| `test_required_all_optional` | Field optional in both → canonical required = False. |
| `test_type_conflict_strict_raises` | A has `dob` as date, B has `dob` as text. With `strict=True`, raises `GroupSchemaTypeConflictError`. |
| `test_type_conflict_soft_warns` | Same setup, `strict=False`. Returns a schema with warning, lower-confidence binding dropped. |
| `test_warning_label_divergence` | Same canonical key, divergent labels ("Patient Name" vs "Client Full Name"). Warning emitted; first binding's label wins. |
| `test_apply_record_happy_path` | 3-template group, 1 record with all fields → result has 3 outcomes, all `filled`, summary `{filled: 3, errored: 0, skipped: 0}`. |
| `test_apply_record_partial_failure_continue` | One template's fill engine raises. With `on_template_error="continue"`, returns 3 outcomes (1 errored, 2 filled), no exception. |
| `test_apply_record_partial_failure_abort` | Same setup, `on_template_error="abort"`. Raises after first error; result vector contains only outcomes prior to abort. |
| `test_apply_record_missing_field_skip` | Record missing `patient_name`. With `on_missing_field="skip"`, that field is in `fieldsSkipped[]`, fill proceeds. |
| `test_apply_record_missing_field_error` | Same setup, `on_missing_field="error"`. Each template outcome is errored. |
| `test_snapshot_round_trip` | `freeze_group_schema_snapshot` → `apply_group_record(snapshot=...)` works after the source group is mutated (template field added). The snapshot is honored, not the live group state. |
| `test_json_schema_strict` | `build_group_canonical_json_schema` returns `{"additionalProperties": false}`, `required` array equals canonical required keys, enum types correctly map. |
| `test_json_schema_no_phantom_fields` | A canonical field with no `allowedValues` does not produce an `enum` in the JSON schema. |
| `test_cache_invalidates_on_template_update` | Build schema, mutate template's `updated_at`, build again — second build returns the new schema (cache key includes max updated_at). |
| `test_cache_skipped_when_overrides_provided` | Passing `template_overrides` bypasses cache. |

**Coverage target:** ≥95% line coverage on `group_schema_service.py` and `group_schema_types.py`. Enforce in `pytest --cov`.

#### 2.9.2 Integration tests

None for Phase 1 — the service has no HTTP surface yet. Integration coverage comes via Phases 2–4.

#### 2.9.3 Playwright e2e

None for Phase 1.

#### 2.9.4 Acceptance criteria

- [ ] All unit tests above pass.
- [ ] `build_group_fill_link_questions` and `_build_group_web_form_schema` are reduced to thin transformations over `build_group_canonical_schema` output. Their existing tests (in `backend/test/unit/api/test_main_fill_links_endpoints_blueprint.py`) still pass without modification.
- [ ] No existing Fill By Link test regresses.
- [ ] `pytest --cov=backend.services.group_schema_service` reports ≥95%.

**Effort:** 2–3 days.

---

## 3. Phase 2 — Search & Fill from files (group mode)

### 3.1 Files to add

| Path | Purpose |
|---|---|
| `backend/api/routes/group_fill.py` | New thin route exposing `POST /api/groups/{group_id}/search-fill/apply`. (See 3.3 for whether this is needed — depends on OQ-2.) |
| `frontend/test/unit/utils/test_search_fill_apply_group.test.ts` | Unit tests for the new client-side group apply path. |
| `frontend/test/playwright/run_workspace_group_search_fill.mjs` | Playwright e2e. |

### 3.2 Files to modify

| Path | Change |
|---|---|
| `frontend/src/components/features/SearchFillModal.tsx` | When opened in a group context, render the **"Apply to all forms in this group"** checkbox. Default ON in group context, hidden in single-template context. |
| `frontend/src/utils/searchFillApply.ts` | New branch `applyRowToGroup(row, canonicalSchema, templates)` that loops template-by-template, projects the row through bindings, and calls the existing per-template apply. |
| `frontend/src/hooks/useWorkspaceGroupCoordinator.ts` | New action `handleGroupSearchFill(row, options)` that orchestrates the multi-template apply within the workspace and returns a `GroupFillResult`-shaped vector for UI rendering. |
| `frontend/src/services/api.ts` | New client method `fetchGroupCanonicalSchema(groupId)` calling `GET /api/groups/{group_id}/canonical-schema`. |
| `backend/api/routes/groups.py` | New route `GET /api/groups/{group_id}/canonical-schema` returning `{schema, warnings}`. Read-only. Used by Search & Fill modal to render the field list and the "fields skipped" preview. |

### 3.3 OQ-2 resolution

**Question:** Does the current single-template Search & Fill apply happen client-side, server-side, or both?

**Resolution before starting Phase 2** (15-min check):

```bash
grep -n "applyRow\|searchFillApply" frontend/src/utils/searchFillApply.ts
grep -rn "search.fill\|search_fill" backend/api/routes/
```

- If client-side only → Phase 2 is purely a client-side change. The new backend route in 3.1 is **not** needed for Search & Fill; it's still added for the Fill By Link / API Fill phases that need server-side `apply_group_record`.
- If server-side → add `POST /api/groups/{group_id}/search-fill/apply` (this is what 3.1 anticipates).

**Default assumption (revisable):** client-side, because the README explicitly says "row data stays in the browser" for Search & Fill. So `applyRowToGroup` lives in `searchFillApply.ts` and the loop is client-side.

### 3.4 UI behavior

Modal opened from a group context (group selected in workspace, multi-template view active):

```
┌─────────────────────────────────────────────────────────┐
│  Search & Fill — Group: I-130 Spouse Packet            │
├─────────────────────────────────────────────────────────┤
│  [ ] Apply to all forms in this group   ← Phase 2      │
│      Will fill 7 forms from the selected row.          │
│      47 unique fields across all forms.                │
│                                                         │
│  Search column:  [ MRN ▾ ]                             │
│  Match mode:     ( ) exact   (•) contains              │
│  Search value:   [______________]   [Search]           │
│                                                         │
│  Results:                                              │
│    ⦿ MRN-1024 — Aria Patel   DOB 1992-04-11           │
│    ○ MRN-1025 — Ben Lee      DOB 1988-09-03            │
│                                                         │
│  Selected row will fill:                                │
│    ✓ I-130       (12/12 fields)                        │
│    ✓ I-130A      (8/8 fields)                          │
│    ✓ G-28        (4/4 fields)                          │
│    ✓ I-864       (15/15 fields)                        │
│    ⚠ I-765       (6/7 fields — "ssn" missing)          │
│    ✓ G-1145      (2/2 fields)                          │
│    ✓ I-693       (3/3 fields)                          │
│                                                         │
│              [Cancel]              [Fill 7 Forms]      │
└─────────────────────────────────────────────────────────┘
```

When checkbox is OFF (or modal opened from a single-template view), the existing single-template behavior is unchanged.

### 3.5 Quota integration

Each materialized PDF counts as one fill against the user's monthly quota (D7). Pre-validate quota **before** materializing any PDFs:

```typescript
// pseudocode
const requiredFills = templates.length;
if (!await checkQuota(user, requiredFills)) {
  showQuotaError("This will fill 7 forms but you only have 3 fills left this month.");
  return;
}
```

The pre-check uses a new client method `checkGroupFillQuota(groupId, pdfCount)` that wraps `GET /api/limits/precheck?fills={n}`. (This endpoint is added in Phase 5.)

### 3.6 Phase 2 QA

#### 3.6.1 Unit tests — `frontend/test/unit/utils/test_search_fill_apply_group.test.ts`

| Test name | What it asserts |
|---|---|
| `applies_row_to_all_templates_in_group` | 3-template group, 1 row → 3 fill payloads built, each with the correct bindings projected. |
| `skips_template_with_no_matching_bindings` | One template has no canonical fields present in the row → outcome status `skipped`. |
| `surfaces_partial_field_misses_per_template` | Row missing `ssn`. Templates that need `ssn` report it in `fieldsSkipped`. |
| `respects_canonical_field_normalization` | Row keys are `Patient Name` (display label), `patientName` (camelCase). Both are accepted and mapped to canonical `patient_name`. |
| `does_not_mutate_input_row` | Source row dict is unchanged after apply (defensive immutability check). |
| `groups_checkbox_options_correctly` | Row has `marital_status: "married"`. The checkbox group field on each template is set with the correct option key. |
| `returns_summary_counts` | Result has `summary.filled = 2, errored = 0, skipped = 1` for a known mixed input. |

#### 3.6.2 Backend unit tests — `backend/test/unit/api/test_groups_canonical_schema_route.py`

| Test name | What it asserts |
|---|---|
| `get_canonical_schema_returns_200_with_schema` | Authenticated user, owner of group → 200, body matches `GroupCanonicalSchema` shape. |
| `get_canonical_schema_404_for_unknown_group` | Group ID does not exist → 404. |
| `get_canonical_schema_403_for_other_user` | Group exists but is owned by another user → 403. |
| `get_canonical_schema_includes_warnings_in_soft_mode` | Group has a label divergence → response includes the warning. |
| `get_canonical_schema_returns_429_for_type_conflict_in_strict_mode` | Strict-mode call (with `?strict=true`) returns 422 with conflict details. |

#### 3.6.3 Integration tests

Light: `backend/test/integration/test_groups_search_fill_quota.py`
- Authenticate, create group, call quota precheck endpoint with `pdfCount=N`, assert response matches user's plan limits.

#### 3.6.4 Playwright e2e — `frontend/test/playwright/run_workspace_group_search_fill.mjs`

Scenario:
1. Log in as a fixture user with a pre-built 3-template group ("immigration_test_packet") and a fixture CSV with 5 rows.
2. Open the workspace, switch to the group view.
3. Open Search & Fill modal — assert title contains "Group:" and the "Apply to all forms in this group" checkbox is visible and checked by default.
4. Type a search value matching row 2.
5. Click the result row — assert the per-template preview shows 3 templates with field counts.
6. Click "Fill 3 Forms".
7. Wait for fill completion. Assert workspace shows a packet view with 3 PDF tabs.
8. For each PDF tab: assert the PDF rendered (canvas non-empty), assert at least one expected value (e.g. patient name) appears in extracted text via `page.evaluate`-driven PDF text extraction.
9. Assert the workspace's quota indicator decreased by 3 (or by however many PDFs were materialized).

#### 3.6.5 Acceptance criteria

- [ ] All Phase 2 unit and integration tests pass.
- [ ] Playwright `run_workspace_group_search_fill.mjs` passes locally and in CI.
- [ ] Single-template Search & Fill modal behavior is unchanged (existing tests in `frontend/test/unit/components/features/test_search_fill_modal*.test.tsx` still pass without modification).
- [ ] Manual smoke: open the modal, uncheck the "Apply to all forms" checkbox, verify behavior reverts to single-template (only the active template fills).

**Effort:** 1–2 days.

---

## 4. Phase 3 — Fill By Link (group mode): finish the partial implementation

The plumbing exists. What's missing is (a) the schema snapshot, (b) the multi-PDF generation loop, (c) the explicit checkbox UI, (d) the owner-side packet download button, and (e) removing the public PDF download hard block.

### 4.1 Files to add

| Path | Purpose |
|---|---|
| `backend/test/integration/test_fill_links_group_round_trip.py` | Integration test that exercises publish → respondent submit → owner generates packet. |
| `frontend/test/playwright/run_fill_link_group_round_trip.mjs` | Playwright e2e for the full owner+respondent flow. |

### 4.2 Files to modify

| Path | Change |
|---|---|
| `backend/api/routes/fill_links.py` (publish handler, ~line 413) | On group publish, call `freeze_group_schema_snapshot` and persist on the record as `canonical_schema_snapshot`. Reject the publish if `build_group_canonical_schema(strict=True)` raises a type conflict (D1). |
| `backend/api/routes/fill_links_public.py` (lines 692-696) | **Remove** the hard `scope_type != "template"` block. Add a branch: if `record.scope_type == "group"`, call `materialize_group_response_packet`, return zip / merged PDF / JSON envelope per `?format=` (D3). |
| `backend/services/fill_links_service.py` | Add `materialize_group_response_packet(record, response_id, format)` that loads the snapshotted schema from the record, projects the response into a record dict, calls `apply_group_record(snapshot=record.canonical_schema_snapshot)`, and packages the resulting PDFs per format. |
| `backend/services/fill_links_service.py` (`build_group_fill_link_questions`, ~line 695) | Already covered by Phase 1 refactor — verified delegating to canonical schema service. |
| `backend/firebaseDB/fill_link_database.py` | Add nullable `canonical_schema_snapshot` column / Firestore field on fill_link records. Old records remain `None`. |
| `frontend/src/components/features/FillLinkManagerDialog.tsx` (line ~2150, `FillLinkScopePanel` for `kind="group"`) | (a) Render the **"Apply this Fill By Link to all forms in the group"** checkbox, defaulting ON, with no off-state (publish is gated on it being ON — this is the explicit-consent checkbox per D4). (b) Show a preview: "Respondents will see N questions covering M forms." (c) Show any schema warnings inline. (d) For each existing group response, render a **"Generate packet"** button next to "Apply to fill". |
| `frontend/src/services/fillLinksApi.ts` | New methods `downloadFillLinkResponsePacket(linkId, responseId, format)` and `previewGroupCanonicalSchema(groupId)`. |
| `frontend/src/hooks/useWorkspaceFillLinks.ts` | New action `handleDownloadGroupResponsePacket(responseId, format)`. |
| `backend/test/unit/api/test_main_fill_links_endpoints_blueprint.py` (line ~887, `test_fill_links_create_group_link_merges_group_templates`) | **Replace** the existing error-asserting test with a happy-path test. The current test asserts that publishing a group link with `respondentPdfDownloadEnabled: True` fails with the "template fill by link" error — that error path is going away. Rewrite to assert successful publish with snapshot persisted. |

### 4.3 Public download endpoint contract

```
GET /api/fill-links/public/{token}/responses/{response_id}/download
  ?format=zip           (default; multi-PDF zip)
  ?format=merged        (single concatenated PDF)
  ?format=json          (JSON envelope, base64 PDFs, per-template status)

  For scope=template: existing behavior (single PDF).
  For scope=group:    new behavior, formats above.
```

Response codes:
- **200** — all templates filled successfully.
- **207** — Multi-Status. At least one template errored. Body is JSON envelope with per-template outcomes; available only when `format=json`. For zip / merged formats, return 200 with successful PDFs and a `X-DullyPDF-Failed-Templates` header listing failed template IDs.
- **404** — token / response not found.
- **409** — snapshot stale (group has been edited since publish; D5). Body explains "republish required".
- **422** — JSON Schema validation of stored response failed against snapshot (should be impossible if validation runs on submit, but defensive).
- **429** — quota exceeded (the materialization would push the owner over their monthly fill budget).

### 4.4 Owner-side workspace UI

Inside `FillLinkManagerDialog`, the response section already lists responses for the current link. For group-scope links, augment each row:

```
┌──────────────────────────────────────────────────────────────┐
│  Response from Aria Patel — submitted 2026-04-11 14:22       │
│  Snapshot version: 4   Schema status: ✓ current              │
│                                                              │
│  Fields filled: 47/47                                        │
│                                                              │
│  [ Apply to current template ]   [ Generate packet ▾ ]       │
│                                    ├ Download as zip          │
│                                    ├ Download as merged PDF   │
│                                    └ View per-template status │
└──────────────────────────────────────────────────────────────┘
```

If the snapshot is stale (group has been updated since publish), the row shows a warning banner and the "Generate packet" button is disabled with a tooltip "Republish this Fill By Link to use new responses with the updated group" (D5).

### 4.5 Phase 3 QA

#### 4.5.1 Unit tests — backend

Add to `backend/test/unit/api/test_main_fill_links_endpoints_blueprint.py`:

| Test name | What it asserts |
|---|---|
| `test_fill_links_create_group_link_persists_snapshot` | Publish a group link → record has non-null `canonical_schema_snapshot` matching the canonical schema at publish time. |
| `test_fill_links_create_group_link_rejects_type_conflict` | Group with conflicting field types → publish returns 422 with conflict details. |
| `test_fill_links_create_group_link_warnings_visible_but_not_blocking` | Group with label divergence (warning, not error) → publish succeeds, response body includes warnings. |

Add to `backend/test/unit/services/test_fill_links_service_materialize_packet.py` (new file):

| Test name | What it asserts |
|---|---|
| `materialize_packet_zip_format` | Returns zip bytes containing N entries named `{templateName}.pdf`. |
| `materialize_packet_merged_format` | Returns single PDF bytes; page count equals sum of per-template page counts. |
| `materialize_packet_json_format` | Returns JSON dict with `perTemplate[]` containing base64 PDF, status, and field counts. |
| `materialize_packet_partial_failure_zip` | One template errors → zip contains successful PDFs, response includes `X-DullyPDF-Failed-Templates` header. |
| `materialize_packet_partial_failure_json` | Same, JSON format → status 207, perTemplate has `errored` outcome. |
| `materialize_packet_uses_snapshot_not_live_group` | After publishing, mutate the source group (add a template). Materialize → result reflects the snapshot, not the new group state. |
| `materialize_packet_404_for_unknown_response` | Bad response_id → 404. |

Update `backend/test/unit/api/test_main_fill_links_endpoints_blueprint.py` (replacing the existing error-asserting test):

| Test name | What it asserts |
|---|---|
| `test_fill_links_create_group_link_merges_group_templates` | (Rewritten) Publish a group link with all required group templates → 201, snapshot persisted, no error. |

#### 4.5.2 Integration tests — `backend/test/integration/test_fill_links_group_round_trip.py`

End-to-end inside the FastAPI test client, no browser:

| Test name | What it asserts |
|---|---|
| `test_round_trip_group_fill_link_zip` | Authenticate as owner → create 3-template group → publish group fill link → simulate respondent GET form schema → simulate respondent POST submission → as owner, GET `/responses/{id}/download?format=zip` → assert 3 PDFs in zip with expected field values. |
| `test_round_trip_group_fill_link_merged` | Same, `format=merged`. Assert single PDF, page count matches. |
| `test_round_trip_group_fill_link_json` | Same, `format=json`. Assert envelope with 3 perTemplate entries, all `filled`. |
| `test_round_trip_partial_failure_returns_207_json` | Set up one template to fail materialization (e.g. corrupt source PDF) → expect 207 from `format=json`, 200 + header from `format=zip`. |
| `test_stale_snapshot_returns_409_or_warning` | Publish, then mutate group → owner attempts to download → expect 409 OR (per D5 implementation) successful download with stale-banner metadata in response. Document the chosen behavior. |
| `test_round_trip_quota_blocks_when_under` | Owner is on free tier with 2 fills left, group has 7 templates → download attempt returns 429 with "quota exhausted" body. |
| `test_existing_single_template_link_unchanged` | Pre-Phase-3 single-template fill link → publish, submit, download. Assert behavior is byte-identical to the pre-migration baseline (snapshot from `git show HEAD~1:...`). |

#### 4.5.3 Playwright e2e — `frontend/test/playwright/run_fill_link_group_round_trip.mjs`

Two browser contexts in one test (owner and respondent), or two sequential test runs sharing fixture state.

Scenario:
1. **Owner context:** Log in. Open the workspace, switch to a 3-template fixture group. Open Fill By Link manager. Click "Publish for group". Assert the "Apply this Fill By Link to all forms in the group" checkbox is visible and enabled. Click "Publish". Assert success toast and that a public URL is shown. Copy the URL.
2. **Respondent context (new browser context, no auth):** Navigate to the public URL. Assert form renders. Assert question count matches the canonical schema (e.g. 47). Fill all fields. Click "Submit". Assert "Thank you" page.
3. **Owner context:** Refresh the Fill By Link manager. Assert the new response appears in the response list with status "Submitted". Click "Generate packet" → "Download as zip". Wait for download. Assert downloaded file is a zip with 3 PDFs.
4. Open one PDF (programmatic check via `pdf-parse` or similar in the test). Assert at least one expected field value is present in extracted text.
5. **Owner context:** Edit one of the templates in the group (add a field). Refresh the manager. Assert the existing response now has a "stale snapshot" warning. Assert the "Generate packet" button is disabled with the expected tooltip.

#### 4.5.4 Acceptance criteria

- [ ] All Phase 3 unit and integration tests pass.
- [ ] Playwright `run_fill_link_group_round_trip.mjs` passes locally and in CI.
- [ ] The hard block at `fill_links_public.py:692-696` is gone. Manual `curl` against a group fill link's public download endpoint returns a zip, not 409.
- [ ] Existing single-template Fill By Link tests pass without modification.
- [ ] Manual smoke: publish a group fill link as a real user, fill it from a phone browser, download the packet from the workspace.

**Effort:** 3–4 days.

---

## 5. Phase 4 — API Fill (group mode)

The largest piece. Introduces a second API endpoint kind ("group endpoint") alongside the existing template endpoint.

### 5.1 Files to add

| Path | Purpose |
|---|---|
| `backend/services/template_api_group_service.py` | New service that owns group-endpoint creation, validation, and fill execution. Wraps `group_schema_service.apply_group_record` with API-specific concerns (rate limits, audit events, response formatting). |
| `backend/test/unit/services/test_template_api_group_service.py` | Unit tests for the new service. |
| `backend/test/integration/test_template_api_group_endpoints.py` | Integration tests for the public POST flow. |
| `frontend/test/playwright/run_template_api_group_manager.mjs` | Playwright e2e for the publish + curl flow. |

### 5.2 Files to modify

| Path | Change |
|---|---|
| `backend/api/routes/template_api.py` | Endpoint creation accepts `scope: "template" \| "group"` plus either `templateId` or `groupId`. Persist `scope`, `groupId`, `canonical_schema_snapshot` on the endpoint record. Reuse all key management (prefix, hashing, rotation, revocation) unchanged. |
| `backend/api/routes/template_api_public.py` | New branch in the fill handler: if `endpoint.scope == "group"`, validate JSON body against snapshotted canonical JSON schema, call `apply_group_record(snapshot=endpoint.canonical_schema_snapshot)`, return per `?format=` (D3). Existing template-scope branch unchanged. |
| `backend/api/routes/template_api.py` (schema endpoint) | `GET /api/v1/fill/{endpoint_id}/schema` returns the union JSON schema for group endpoints. Existing template behavior unchanged. |
| `backend/firebaseDB/template_api_database.py` | Add nullable `scope`, `group_id`, `canonical_schema_snapshot` fields to endpoint records. |
| `frontend/src/components/features/TemplateApiManager.tsx` (or wherever the API endpoint manager UI lives — verify path) | Add the **"Group endpoint (fill all forms in the group)"** checkbox in the create-endpoint flow. When checked, swap the "Select template" dropdown for a "Select group" dropdown. Show the generated JSON schema preview. Show a curl example. |
| `frontend/src/services/templateApiClient.ts` (or equivalent) | Methods extended to accept `scope: "group"` in create payload. |

### 5.3 Public fill endpoint contract for group endpoints

```
POST /api/v1/fill/{endpoint_id}.pdf
POST /api/v1/fill/{endpoint_id}.zip
POST /api/v1/fill/{endpoint_id}     (with Accept header)

  Authorization: Basic <api_key>
  Content-Type: application/json

  Body: JSON object conforming to the snapshotted canonical JSON schema.
```

Response codes:
- **200** — all templates filled, body is the requested format.
- **207** — multi-status, at least one template failed. Available only with `Accept: application/json` or `?format=json`. For zip/merged formats, return 200 with successful PDFs and `X-DullyPDF-Failed-Templates` header (mirror the Phase 3 contract).
- **400** — JSON parse error.
- **401** — bad / missing API key.
- **422** — JSON schema validation failed. Body lists field errors.
- **429** — rate limited or quota exhausted.

Mime-type matrix:

| URL suffix / Accept | Response |
|---|---|
| `.pdf` or `Accept: application/pdf` | Merged PDF (single file, concatenated pages). |
| `.zip` or `Accept: application/zip` | Zip with one PDF per template, named `{slug(templateName)}.pdf`. |
| (no suffix) `Accept: application/json` | JSON envelope: `{snapshotVersion, summary, perTemplate: [{templateId, templateName, status, base64Pdf, fieldsApplied, fieldsSkipped, error}]}`. |

Default when no Accept header and no suffix: `application/zip` for group endpoints, `application/pdf` for template endpoints (preserving existing behavior).

### 5.4 JSON schema generation rules

`build_group_canonical_json_schema` produces a draft-2020-12 JSON Schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Group: I-130 Spouse Packet",
  "type": "object",
  "additionalProperties": false,
  "required": ["patient_name", "dob", "address_street", ...],
  "properties": {
    "patient_name": {
      "type": "string",
      "title": "Patient name",
      "x-dullypdf-templates": ["tplA", "tplB", "tplC"]
    },
    "dob": {
      "type": "string",
      "format": "date",
      "title": "Date of birth"
    },
    "marital_status": {
      "type": "string",
      "enum": ["single", "married", "divorced", "widowed"]
    },
    "is_us_citizen": {
      "type": "boolean"
    }
  }
}
```

- `additionalProperties: false` (D6).
- `required` array contains every canonical field with `required: True`.
- Each field includes `x-dullypdf-templates` listing template IDs that consume it (debugging aid for API consumers; not validated).

### 5.5 Audit events

Extend the existing event vocabulary in `template_api_public.py`:

| Event | When |
|---|---|
| `fill_succeeded` | All templates filled. Add `pdf_count`, `template_count` to event payload. |
| `group_fill_partial` | New. Fired when a group fill returns 207 / partial failure. Includes `failed_template_ids`. |
| `fill_validation_failed` | Existing. Now also fires for JSON schema validation failures on group endpoints. |
| `fill_quota_blocked` | Existing. New context for groups: payload includes `attempted_pdf_count`. |

### 5.6 Rate limits and quota

- Per-call rate limits unchanged (existing per-IP, per-endpoint, global). One group fill is one HTTP request.
- Quota: each materialized PDF counts as one fill toward the user's monthly budget (D7). Pre-validate **before** materialization.
- Plan limit `pages/request`: bump per Phase 5 to accommodate typical packets. Group endpoints check the sum of pages across all templates against the per-request page limit.

### 5.7 Phase 4 QA

#### 5.7.1 Unit tests — `backend/test/unit/services/test_template_api_group_service.py`

| Test name | What it asserts |
|---|---|
| `create_group_endpoint_persists_scope_and_snapshot` | Creating a group endpoint stores `scope="group"`, `group_id`, and a non-null `canonical_schema_snapshot`. |
| `create_group_endpoint_rejects_type_conflict` | Group with type conflict → creation raises `GroupSchemaTypeConflictError` → API returns 422. |
| `validate_payload_accepts_canonical_keys` | Body with all canonical keys → validates. |
| `validate_payload_rejects_unknown_field` | Body with extra key not in schema → 422 (additionalProperties: false). |
| `validate_payload_rejects_missing_required` | Body missing a required key → 422 with field name. |
| `validate_payload_accepts_enum_value` | Radio-group field with allowed value → validates. |
| `validate_payload_rejects_invalid_enum_value` | Radio-group field with disallowed value → 422 listing allowed values. |
| `fill_group_endpoint_zip_response` | Successful fill → response is zip with N PDFs. |
| `fill_group_endpoint_merged_response` | Successful fill → response is single PDF, page count is sum of templates. |
| `fill_group_endpoint_json_response_partial_failure` | One template errors → JSON envelope, 207, perTemplate with errored entry. |
| `fill_group_endpoint_uses_snapshot_not_live_group` | Mutate source group after endpoint creation → fill uses snapshot. |
| `fill_group_endpoint_quota_precheck_blocks` | User has fewer fills remaining than templates → 429 before any PDF is materialized. |
| `fill_group_endpoint_audit_event_includes_pdf_count` | After a successful fill, audit event payload contains `pdf_count == N`. |

#### 5.7.2 JSON schema tests — `backend/test/unit/services/test_group_canonical_json_schema.py`

| Test name | What it asserts |
|---|---|
| `json_schema_strict_additional_properties` | Generated schema has `additionalProperties: false`. |
| `json_schema_required_array_matches_canonical` | `required` array equals canonical keys with `required: True`. |
| `json_schema_string_for_text_field` | Text field → `type: string`. |
| `json_schema_date_for_date_field` | Date field → `type: string, format: date`. |
| `json_schema_boolean_for_checkbox` | Standalone checkbox → `type: boolean`. |
| `json_schema_enum_for_radio_group` | Radio group → `type: string, enum: [...]`. |
| `json_schema_includes_template_hint` | Each property includes `x-dullypdf-templates` array. |
| `json_schema_validates_with_official_validator` | Use `jsonschema` library: schema validates as a valid JSON Schema document. |
| `json_schema_round_trip_with_sample_payload` | Generate schema, validate a known-good payload → passes. Validate a known-bad payload → fails with expected error. |

#### 5.7.3 Integration tests — `backend/test/integration/test_template_api_group_endpoints.py`

| Test name | What it asserts |
|---|---|
| `e2e_publish_group_endpoint` | POST `/api/template-api-endpoints` with `scope=group, groupId=...` → 201, response body has `keyPrefix`, `id`, `scope=group`. |
| `e2e_get_schema_returns_canonical_json_schema` | GET `/api/v1/fill/{endpoint_id}/schema` → 200, body is canonical JSON schema. |
| `e2e_post_fill_zip_returns_packet` | POST `/api/v1/fill/{endpoint_id}.zip` with Basic auth → 200, content-type zip, contains N PDFs. |
| `e2e_post_fill_merged_returns_single_pdf` | POST `/api/v1/fill/{endpoint_id}.pdf` → 200, content-type `application/pdf`, page count matches. |
| `e2e_post_fill_json_envelope` | POST with `Accept: application/json` → 200, body is JSON envelope. |
| `e2e_post_fill_validation_error` | POST with missing required field → 422, body lists error. |
| `e2e_post_fill_unknown_field_rejected` | POST with extra field → 422. |
| `e2e_post_fill_partial_failure_207_json` | One template configured to fail → 207 with `Accept: json`. |
| `e2e_post_fill_partial_failure_zip_with_header` | Same setup with zip → 200 + `X-DullyPDF-Failed-Templates` header. |
| `e2e_post_fill_quota_blocks` | Free-tier user, attempted fill count exceeds remaining budget → 429. |
| `e2e_rate_limit_per_endpoint` | Rapid calls past `{SCOPE}_PER_ENDPOINT` → 429 with retry-after. |
| `e2e_revoke_endpoint_blocks_fills` | Revoke endpoint, attempt fill → 401. |
| `e2e_rotate_key_blocks_old_key` | Rotate endpoint key, attempt fill with old key → 401, new key works. |
| `e2e_existing_template_endpoint_unchanged` | Pre-migration template endpoint (no scope field) → fill behaves identically to baseline. |
| `e2e_audit_events_recorded_with_pdf_count` | After successful fill, query audit log → event has `pdf_count` and `template_count`. |
| `e2e_group_endpoint_uses_snapshot_after_group_edit` | Publish endpoint, edit underlying group, fill → result reflects snapshot, not edit. |

#### 5.7.4 Playwright e2e — `frontend/test/playwright/run_template_api_group_manager.mjs`

Scenario:
1. Log in as fixture user with a 3-template group fixture.
2. Open the API Fill manager UI.
3. Click "Create endpoint". Toggle the "Group endpoint" checkbox. Assert the template dropdown swaps to a group dropdown. Select the fixture group.
4. Assert the JSON schema preview renders with expected field count.
5. Click "Publish". Assert success toast and that the API key + endpoint URL are shown (one-time display).
6. Copy the curl example from the UI. Use Playwright's `page.evaluate` to run the curl as a `fetch` against the local backend with the auth header set. Assert the response is a zip with 3 PDFs.
7. Click "Rotate key". Assert old key is shown as expired. Re-run the fetch with the old key → expect 401. Re-run with the new key → expect 200.
8. Click "Revoke". Re-run the fetch → expect 401.

Also augment `frontend/test/playwright/run_template_api_manager_real_user_flow.mjs` (existing) with a regression assertion that single-template endpoint creation still works.

#### 5.7.5 Acceptance criteria

- [ ] All Phase 4 unit and integration tests pass.
- [ ] Playwright `run_template_api_group_manager.mjs` passes locally and in CI.
- [ ] The existing `run_template_api_manager_real_user_flow.mjs` still passes.
- [ ] Manual smoke: publish a group endpoint as a real user, run the curl from the docs UI against staging, verify zip download. Verify rotation and revocation work.
- [ ] OpenAPI / docs page updates: the generated API docs include the new schema endpoint, the new fill endpoint variants, and the group response formats.

**Effort:** 4–5 days.

---

## 6. Phase 5 — Plan limits, quota counting, audit (cross-cutting)

### 6.1 Files to modify

| Path | Change |
|---|---|
| `backend/services/limits_service.py` | New function `check_group_fill_quota(user_id, pdf_count, total_pages)` that pre-validates a multi-PDF fill against the user's monthly fill budget and per-request page limit. |
| `backend/api/routes/limits.py` (or wherever the limits HTTP API lives) | New route `GET /api/limits/precheck?fills={n}&pages={p}` that the frontend calls before initiating a group fill. |
| `frontend/src/config/planLimits.mjs` | Bump `pagesPerRequest` to accommodate typical packets. New defaults: free 50, premium 500, god 2000. (Adjust per the actual fixture group sizes once measured.) |
| `frontend/src/services/api.ts` | New client method `precheckGroupFillQuota(pdfCount, pageCount)`. |
| `backend/api/routes/template_api_public.py` | Call `check_group_fill_quota` before materialization. |
| `backend/api/routes/fill_links_public.py` | Same. |
| `frontend/src/components/features/SearchFillModal.tsx` | Call precheck on row select and surface quota errors before fill executes. |

### 6.2 Quota-counting rules (D7)

- **Per-PDF counting.** A group fill that materializes N PDFs counts as N fills toward the user's monthly fill budget.
- **Per-request page limit.** The sum of pages across all PDFs in a single group fill must be ≤ the user's `pagesPerRequest`.
- **Idempotency on partial failure.** If the fill engine errors partway through, the quota counter only increments for successfully-materialized PDFs. Use a transaction or a count-and-decrement pattern; do **not** count attempts.
- **Atomic precheck.** The precheck endpoint reads the user's current usage and returns `{ allowed: bool, fillsRemaining, pagesRemaining, reason? }`. The actual quota debit happens during materialization, with a final reconciliation at the end.

### 6.3 Audit event extensions

In `backend/services/audit_service.py` (or wherever the audit event types are defined):

| Event | Existing? | Phase 5 change |
|---|---|---|
| `fill_succeeded` | Yes | Add `pdf_count: int`, `template_count: int`, `total_pages: int` to payload. |
| `fill_validation_failed` | Yes | No change. |
| `fill_runtime_failed` | Yes | No change. |
| `fill_quota_blocked` | Yes | Add `attempted_pdf_count`, `attempted_page_count`. |
| `group_fill_partial` | **New** | Fired on 207 responses. Payload: `pdf_count_succeeded`, `pdf_count_failed`, `failed_template_ids: list[str]`. |

### 6.4 Phase 5 QA

#### 6.4.1 Unit tests — `backend/test/unit/services/test_limits_service_group_fill.py`

| Test name | What it asserts |
|---|---|
| `precheck_allows_fill_within_budget` | User has 100 fills remaining, requesting 7 → allowed, fillsRemaining=93. |
| `precheck_blocks_fill_over_budget` | User has 5 fills remaining, requesting 7 → blocked, reason="fills_exhausted". |
| `precheck_blocks_pages_over_per_request_limit` | User on free tier (50 pages/request), packet sums to 60 pages → blocked, reason="pages_per_request". |
| `precheck_handles_zero_count` | Edge case: 0 PDFs → allowed (no-op). |
| `quota_debit_only_for_successful_pdfs` | Materialize 7 templates, 2 fail → quota counter increments by 5. |
| `quota_debit_atomic_under_concurrent_fills` | Concurrent group fills cannot exceed budget — second fill is blocked or partial. (Use threading + a real Firestore emulator if the limits store is Firestore.) |

#### 6.4.2 Integration tests

Folded into Phase 3 and Phase 4 integration suites (the `quota_blocks` tests already listed). Add one cross-surface integration test:

| Test name | Path | What it asserts |
|---|---|---|
| `test_quota_consistent_across_surfaces` | `backend/test/integration/test_quota_cross_surface.py` (new) | Authenticate. Run a group Search & Fill (3 PDFs), a group Fill By Link materialization (3 PDFs), and a group API fill (3 PDFs) in sequence. Assert the user's monthly fill counter increased by 9 and the precheck endpoint reports the correct remaining balance after each. |

#### 6.4.3 Playwright

Add an assertion to the existing Phase 2 / Phase 3 / Phase 4 Playwright tests that the workspace's quota indicator decreased by the expected number of PDFs after each group fill.

#### 6.4.4 Acceptance criteria

- [ ] All Phase 5 unit and integration tests pass.
- [ ] `frontend/src/config/planLimits.mjs` page-per-request limits are bumped and existing UI tests still pass (or are updated).
- [ ] The audit log for a group fill includes `pdf_count` and `template_count`.
- [ ] Manual smoke: as a free-tier user, attempt a group fill that would exceed the budget. Verify the UI shows a clear error before the fill starts ("This will fill 7 forms but you only have 3 fills left this month").

**Effort:** 1–2 days.

---

## 7. Phase 6 — Migration and backwards compatibility

No data backfill is required. Every change is additive at the schema level: new nullable columns on existing records, new endpoint kinds alongside existing ones.

### 7.1 Migration tasks

| Task | Action |
|---|---|
| Add nullable `canonical_schema_snapshot` to fill_link records. | Code change in `backend/firebaseDB/fill_link_database.py`. No migration script — Firestore is schemaless; old records just don't have the field. SQL would need an ALTER TABLE if a SQL store is used; verify which backend is in use. |
| Add nullable `scope`, `group_id`, `canonical_schema_snapshot` to template_api_endpoint records. | Same as above in `backend/firebaseDB/template_api_database.py`. |
| Existing single-template fill links (no snapshot, scope_type="template") | Continue to work unchanged. The publish/fill paths already branch on `scope_type`. |
| Existing single-template API endpoints (no scope field) | Treat absent `scope` as `"template"` — defensive default in the public fill handler. |
| Existing group-scope fill link records (the partial implementation, no `canonical_schema_snapshot`) | On next read, attempt to compute a current snapshot from the group state. If the group still exists, use it. If not, mark the link as "snapshot missing — republish required" and disable downloads. |

### 7.2 Defensive defaults

In every new code path that reads `endpoint.scope` or `record.scope_type`:

```python
scope = endpoint.scope or "template"  # defensive default for pre-migration records
```

### 7.3 Phase 6 QA

#### 7.3.1 Migration unit tests — `backend/test/unit/services/test_group_fill_migration.py`

| Test name | What it asserts |
|---|---|
| `pre_migration_template_endpoint_defaults_to_template_scope` | Endpoint dict missing `scope` field → service treats as scope=template. |
| `pre_migration_fill_link_without_snapshot_marked_republish_required` | Existing group fill link without snapshot → downloads return 409 with "republish required" message. |
| `pre_migration_template_fill_link_unchanged` | Existing template fill link → publish + download behavior identical to baseline. |

#### 7.3.2 Acceptance criteria

- [ ] No existing fill link or API endpoint test regresses.
- [ ] Manual smoke against staging: load a real pre-migration single-template fill link, publish a new respondent submission, download. Confirm zero behavior change.

**Effort:** 0.5 day. (Most of the work is already absorbed into Phases 3 and 4.)

---

## 8. Phase 7 — Cross-surface tests

After all four feature phases are merged, add one shared test that exercises **the same group through all three surfaces** to catch divergent behavior between Search & Fill, Fill By Link, and API Fill.

### 8.1 Files to add

| Path | Purpose |
|---|---|
| `backend/test/integration/test_group_fill_cross_surface_consistency.py` | Backend cross-surface test. |
| `frontend/test/playwright/run_group_fill_cross_surface_consistency.mjs` | Optional Playwright equivalent (slower; only run if backend test is insufficient). |

### 8.2 Cross-surface consistency test

Scenario:

1. Authenticate as fixture user.
2. Create a 3-template group with a known canonical schema (e.g. `patient_name`, `dob`, `marital_status`, 3 more fields).
3. Define a single canonical record:
   ```json
   {"patient_name": "Aria Patel", "dob": "1992-04-11", "marital_status": "married", ...}
   ```
4. **Surface 1 — Search & Fill:** call the (client-side or server-side) group apply with this record as a single-row CSV. Capture the 3 generated PDFs.
5. **Surface 2 — Fill By Link:** publish a group fill link, post the same record as a respondent submission, owner downloads packet (zip format). Capture the 3 PDFs.
6. **Surface 3 — API Fill:** publish a group endpoint, POST the same record JSON, capture the 3 PDFs from the zip response.
7. **Assert:** for each template, the field overlay text in PDFs from Surfaces 1, 2, and 3 is identical (extracted via `pdfplumber` or similar). Byte-equality is too strict because timestamps / object IDs may differ; assert text-content equality at the field level.

This catches: divergent field projection, divergent type coercion (e.g. one surface stringifies booleans differently), divergent label rendering, divergent checkbox group handling.

### 8.3 Phase 7 acceptance criteria

- [ ] Cross-surface integration test passes.
- [ ] Test is wired into the CI pipeline and runs on every PR touching `group_schema_service.py`, `fill_links_service.py`, or `template_api_group_service.py`.

**Effort:** 1 day.

---

## 9. Open questions to resolve before starting

| ID | Question | Why it matters | Recommended resolution |
|---|---|---|---|
| **OQ-1** | Is SQL a planned Search & Fill source? You mentioned "CSV, SQL…" but the current code only supports CSV/Excel/JSON/TXT/respondent. | If yes, Phase 2 grows by ~3–5 days (connection manager, query input, secure credential storage). | Defer SQL out of this migration. Tag as a follow-up. The architecture (`apply_group_record` taking a flat dict) is already SQL-ready; only the source UI changes. |
| **OQ-2** | Is the current single-template Search & Fill apply client-side, server-side, or both? | Determines whether Phase 2 needs a new backend route. | 15-minute grep before Phase 2 starts (see 3.3). |
| **OQ-3** | Backend storage for fill_link records and template_api endpoint records — Firestore (schemaless) or a SQL store? | Migration mechanics differ. | Verify in `backend/firebaseDB/`. The path strongly suggests Firestore. |
| **OQ-4** | HIPAA / data retention for group responses. A group response is a more concentrated PHI artifact than a single-template response. | Affects default retention policy and BAA story for healthcare ICP. | Document the current retention policy; decide whether group responses get a shorter default TTL (e.g., 30 days vs current). Out of scope to implement, but call out before launch. |
| **OQ-5** | Fixture group for tests — does one exist or does the test infra need a new fixture? | Affects test setup time per phase. | Create one fixture group ("immigration_test_packet") with 3 templates and a known schema. Use it across Phases 2, 3, 4, 7 tests. |

Resolve OQ-1 through OQ-5 in writing **before** starting Phase 1. Add the resolutions to the bottom of this document under a "Resolutions" section.

---

## 10. Sequencing and effort

| Phase | Days | Depends on | Parallelizable? |
|---|---|---|---|
| 1. Foundation: canonical schema service | 2–3 | — | No. Blocks everything. |
| 2. Search & Fill from files (group mode) | 1–2 | Phase 1 | Yes, with Phase 3 and Phase 4 |
| 3. Fill By Link group (finish) | 3–4 | Phase 1 | Yes, with Phase 2 and Phase 4 |
| 4. API Fill group | 4–5 | Phase 1 | Yes, with Phase 2 and Phase 3 |
| 5. Limits/quota/audit | 1–2 | Phases 2/3/4 partial | Run in parallel with end of Phase 4 |
| 6. Migration | 0.5 | Phases 3 and 4 | Folded in |
| 7. Cross-surface test | 1 | All previous | Last |
| **Total (sequential)** | **15–20 days** | | |
| **Total (parallel where possible, solo)** | **~12–14 days** | | |

**Practical solo schedule (3 weeks):**

| Week | Work |
|---|---|
| **Week 1** | Phase 1 (3 days) + Phase 2 (2 days) → ship Search & Fill group mode behind a feature flag. Validate the wedge demo for immigration outreach. |
| **Week 2** | Phase 3 (4 days) + start Phase 4 (1 day) → finish Fill By Link group flow including the public download endpoint. |
| **Week 3** | Phase 4 (3 more days) + Phase 5 (1 day) + Phase 6 (0.5 day) + Phase 7 (1 day) → ship API Fill group endpoints, quota integration, cross-surface tests. |

---

## 11. Launch checklist

Before flipping the migration on for real users:

- [ ] All unit and integration tests across Phases 1–7 pass in CI.
- [ ] All Playwright e2e tests pass against a fresh staging deploy.
- [ ] The cross-surface consistency test (Phase 7) passes.
- [ ] Manual smoke per phase (see acceptance criteria in each phase) is signed off.
- [ ] Pre-migration single-template Fill By Link and API endpoint behavior is verified unchanged against staging.
- [ ] Documentation updates:
  - [ ] `README.md` — describe group fill in the workflows table.
  - [ ] `frontend/src/config/blogContent.mjs` — add a blog post draft "Fill an entire I-130 packet from one CSV row" or equivalent (gates on the immigration outreach campaign).
  - [ ] API docs page renders the new schema endpoint and group fill response formats.
  - [ ] Pricing page footnote about per-PDF quota counting (D8).
- [ ] Audit log review: confirm `fill_succeeded` events for group fills include `pdf_count` and `template_count`.
- [ ] Quota precheck UX: confirm the user sees a clear pre-fill error when they don't have enough budget.
- [ ] Stale snapshot UX: confirm the "republish required" banner appears when expected.
- [ ] Type conflict UX: confirm publish is blocked with a clear error when two templates have conflicting field types.
- [ ] Free-tier limits make sense for typical packets. Re-measure with real fixture groups; adjust `frontend/src/config/planLimits.mjs` if needed.
- [ ] Rate limit headroom verified for API Fill group endpoints — a typical group fill does not exhaust the per-IP or per-endpoint window faster than a single-template fill.
- [ ] Rollback plan: every code change is behind a feature flag (`GROUP_FILL_MIGRATION_ENABLED`, default OFF) until launch day. Flag is removed after 1 week of clean production traffic.

---

## 12. Decision register

Track decisions here as they're made. Update with rationale and date.

| ID | Decision | Status | Date | Rationale |
|---|---|---|---|---|
| D1 | Type conflict handling: hard error on publish, soft warning in workspace | Proposed | — | Publish-time errors force the user to fix the underlying schema; workspace soft mode preserves productivity. |
| D2 | Required = strictest across templates | Proposed | — | Prevents silently producing under-filled PDFs. |
| D3 | Multi-PDF response: zip default, merged via `?format=merged`, JSON envelope via `?format=json` | Proposed | — | Lawyers want per-template files for filing; merged is for printing; JSON is for API consumers wanting partial-failure detail. |
| D4 | Group Fill By Link checkbox is required-on; no "publish without unifying" mode | Proposed | — | Keeps the surface simple. The checkbox is explicit-consent UX. |
| D5 | Template edit after publish: snapshot stays frozen, "republish required" banner | Proposed | — | Prevents silent contract drift. |
| D6 | API Fill JSON schema: `additionalProperties: false`, strict | Proposed | — | Clear contract for API consumers. |
| D7 | Quota counting: per-PDF, not per-call | Proposed | — | Only model that scales economically. |
| D8 | Pricing page: fold per-PDF counting into existing "fills/month" with footnote | Proposed | — | Avoids new line item complexity. |

---

## 13. Resolutions

(Fill in as OQ-1 through OQ-5 are resolved before starting Phase 1.)

- OQ-1: _pending_
- OQ-2: _pending_
- OQ-3: _pending_
- OQ-4: _pending_
- OQ-5: _pending_
