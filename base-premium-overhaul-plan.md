# Base/Premium Entitlement Overhaul Plan

Status: Proposed implementation plan

Last updated: 2026-03-28

Scope: Backend, frontend, billing downgrade behavior, Fill By Link quota enforcement, OpenAI base refill behavior, documentation, and QA

## 1. Executive summary

This plan replaces the current downgrade-retention-and-purge model with a deterministic access-lock model, updates plan quotas to match the new product direction, and defines the full QA matrix required before rollout.

The plan intentionally keeps the current API Fill monthly model and intentionally does not add monthly signing quotas in the same release. Signing remains per immutable document version for this overhaul. That keeps the migration surface smaller and avoids coupling quota rewrites with compliance-sensitive signing retention behavior.

The biggest product changes are:

- Base/free saved templates become `5`
- Premium/pro saved templates become `100`
- Fill By Link active-count gating is removed
- Fill By Link accepted responses become monthly per-account quotas, not per-link quotas
- Base/free gets `25` Fill By Link accepted responses per month
- Premium/pro gets `10,000` Fill By Link accepted responses per month
- Base/free OpenAI credits refill monthly up to `10`, but never above `10` from the refill itself
- Downgrade no longer deletes templates
- On downgrade, the user keeps access to the earliest `5` created templates
- Templates beyond the plan remain stored but locked until upgrade

This document also defines naming cleanup that should happen during implementation. The current term `downgrade_retention` is no longer accurate once deletion and grace-period purge are removed. The replacement should be modeled as template access policy, not retention.

## 2. Locked decisions

These decisions are treated as fixed for this implementation unless explicitly changed later.

### 2.1 Plan limits

Public naming:

- Free
- Premium

Internal role naming remains:

- `base`
- `pro`
- `god`

Target limits:

| Capability | Base / Free | Pro / Premium | Notes |
| --- | ---: | ---: | --- |
| Saved templates | 5 | 100 | Durable-object cap |
| Active Fill By Links | not gated | not gated | No active-count limit |
| Fill By Link accepted responses | 25 / month | 10,000 / month | Account-level monthly quota |
| API Fill monthly requests | unchanged | unchanged | Keep current model |
| API Fill active endpoints | unchanged | unchanged | Keep current model |
| Signing quota | unchanged | unchanged | Keep per-document limit model |
| Base OpenAI refill | refill to 10 monthly | n/a | Applies only to base pool |
| Premium OpenAI monthly pool | unchanged | unchanged | Keep current pro model |

### 2.2 Downgrade behavior

When a pro account downgrades to base and owns more than 5 templates:

- the 5 earliest created templates remain accessible
- all later-created templates remain stored but locked
- no templates are deleted because of downgrade
- no grace period is used
- no delete-now action is offered
- no automatic purge job applies to this feature

### 2.3 First-five rule

The deterministic access rule for this release is:

1. sort templates by `created_at` ascending
2. break ties by `id` ascending
3. keep the first 5 accessible
4. lock every template after that

This rule is not the best long-term UX, but it is deterministic, easy to explain, and easy to test. Manual pinning of accessible templates is intentionally deferred. It should not be mixed into this overhaul.

### 2.4 Fill By Link quota semantics

The new Fill By Link quota counts:

- one accepted response record equals one monthly response credit

The new Fill By Link quota does not count:

- number of templates
- number of Fill By Link records
- number of fields in a template
- number of PDFs in a group
- view traffic
- retries that reuse the same idempotent attempt record

### 2.5 Non-goals for this release

This overhaul does not:

- add monthly signing quotas
- change API Fill quota semantics
- restore already deleted downgrade-purged templates from past releases
- introduce manual template selection during downgrade
- change the pro monthly OpenAI pool or refill pack model

## 3. Why the current implementation must be replaced

The current implementation is built around temporary downgrade retention and eventual deletion.

Current characteristics:

- `backend/services/downgrade_retention_service.py` computes kept templates, pending-delete templates, grace deadlines, and pending-delete links
- `backend/api/routes/profile.py` exposes downgrade-retention summary plus mutation endpoints
- `frontend/src/hooks/useDowngradeRetentionRuntime.ts` and `frontend/src/components/features/DowngradeRetentionDialog.tsx` assume user-managed keep/delete flows
- `backend/firebaseDB/fill_link_database.py` used to enforce Fill By Link response caps per link through a per-link quota field instead of an account-level monthly counter
- `backend/services/limits_service.py` still advertises Fill By Link active-count limits and per-link response limits
- `backend/firebaseDB/user_database.py` supports pro monthly OpenAI cycles, but base credits are still a single-bucket balance without a month key

That architecture is wrong for the new product policy because:

- a no-deletion downgrade policy should not be implemented through a pending-delete queue
- a monthly Fill By Link quota should not reuse a per-link field name or per-link close behavior
- a base monthly refill should not be layered in as an ad hoc profile-only calculation
- the frontend should not continue to present delete-now and grace-period concepts after the product removes them

## 4. Naming and contract rules

Two naming rules must be enforced during implementation.

### 4.1 Do not keep `downgrade_retention` as the primary model name

Recommended replacement names:

- backend service: `template_access_service.py`
- backend summary key on profile: `templateAccess`
- frontend hook: `useTemplateAccessRuntime`
- frontend dialog or banner component: `TemplateAccessDialog` or `TemplateAccessBanner`

Compatibility note:

- The old `downgradeRetention` naming can remain as a temporary read-compatibility alias for one implementation phase if needed, but new logic should not be authored under that name.

### 4.2 Do not reuse the legacy per-link response field to mean monthly quota

Recommended new profile fields:

- `fillLinkResponsesMonthlyMax`
- `fillLinkResponsesThisMonth`
- `fillLinkResponsesMonthlyRemaining`

Recommended temporary compatibility approach:

- remove `fillLinksActiveMax` from shared limit payloads once all public plan surfaces read the monthly response quota instead
- keep the legacy per-link response field in the payload for one release as deprecated or omit it from new surfaces once frontend is ready
- do not reinterpret the legacy per-link response field with new monthly semantics

## 5. Target data model

## 5.1 User document

Current user document already stores:

- `role`
- base OpenAI credits
- pro monthly credits
- pro refill credits
- downgrade-retention fields

Target additions and replacements:

```json
{
  "role": "base",
  "openai_credits_remaining": 7,
  "openai_credits_base_cycle_key": "2026-03",
  "openai_credits_monthly_remaining": 500,
  "openai_credits_refill_remaining": 0,
  "template_access": {
    "policy_version": 2,
    "applied_at": "2026-03-28T12:00:00+00:00",
    "saved_forms_limit": 5,
    "selection_strategy": "oldest_created",
    "accessible_template_ids": ["tpl-001", "tpl-002", "tpl-003", "tpl-004", "tpl-005"],
    "locked_template_ids": ["tpl-006", "tpl-007"]
  }
}
```

Rules:

- `template_access` exists only when the account is over the base saved-template limit
- `template_access` is cleared when the account returns to pro or when the user no longer exceeds the base template limit
- `openai_credits_base_cycle_key` applies only to the base credit bucket
- pro monthly credits continue using their existing cycle field

## 5.2 Fill By Link monthly usage collection

Add a new collection similar to API Fill usage counters.

Recommended collection:

- `fill_link_usage_counters`

Recommended document id:

- `{user_id}__{month_key}`

Recommended document shape:

```json
{
  "user_id": "user-123",
  "month_key": "2026-03",
  "accepted_response_count": 19,
  "created_at": "2026-03-01T00:00:01+00:00",
  "updated_at": "2026-03-28T14:05:22+00:00"
}
```

Rules:

- increment only for new accepted submissions
- do not increment on idempotent retry of an existing attempt
- do not increment when the submission is rejected due to lock, closure, or quota exhaustion
- count group-link responses exactly once per accepted response

## 5.3 Template access summary contract

Recommended `GET /api/profile` payload shape:

```json
{
  "role": "base",
  "limits": {
    "savedFormsMax": 5,
    "fillLinkResponsesMonthlyMax": 25,
    "fillLinkResponsesThisMonth": 12,
    "fillLinkResponsesMonthlyRemaining": 13,
    "templateApiRequestsMonthlyMax": 250,
    "signingRequestsMonthlyMax": 25
  },
  "templateAccess": {
    "policyVersion": 2,
    "appliedAt": "2026-03-28T12:00:00+00:00",
    "selectionStrategy": "oldest_created",
    "savedFormsLimit": 5,
    "accessibleTemplateIds": ["tpl-001", "tpl-002", "tpl-003", "tpl-004", "tpl-005"],
    "lockedTemplateIds": ["tpl-006", "tpl-007"],
    "counts": {
      "accessibleTemplates": 5,
      "lockedTemplates": 2,
      "lockedGroups": 1,
      "lockedFillLinks": 2,
      "lockedApiEndpoints": 1,
      "lockedSigningDrafts": 3,
      "retainedSigningRequests": 4
    }
  }
}
```

## 6. Four-phase implementation plan

## Phase 1. Contract, limits, and policy versioning

Goal:

- define the new entitlement contract without partially mutating runtime behavior

Primary files:

- `backend/services/limits_service.py`
- `backend/firebaseDB/user_database.py`
- `backend/api/routes/profile.py`
- `frontend/src/services/api.ts`
- `frontend/src/config/planLimits.mjs`

Work items:

1. Introduce policy version `2` for the new entitlement system.
2. Update saved-template limits from `3 / 100` to `5 / 100`.
3. Add explicit monthly Fill By Link limit fields to the backend limits payload.
4. Keep API Fill limits unchanged.
5. Keep signing limits unchanged.
6. Add base OpenAI cycle-key support to the user document model.
7. Define temporary compatibility behavior for legacy profile fields.

Recommended backend changes:

- add `resolve_fill_link_responses_monthly_limit(role)`
- remove the old active-link-cap helper once monthly account quota is the only enforced Fill By Link limit
- add a helper that resolves the current month key for base OpenAI refill

Recommended frontend changes in this phase:

- add new types for Fill By Link monthly usage values
- do not yet remove old fields from TypeScript types until phase 3 is ready

Acceptance criteria:

- one clear source of truth for plan limits
- no ambiguity in field naming
- no new code authored against per-link response semantics

## Phase 2. Backend runtime enforcement and migration

Goal:

- make the backend enforce locking instead of deletion and make Fill By Link quota monthly instead of per link

Primary files:

- `backend/services/downgrade_retention_service.py` or a renamed replacement
- `backend/firebaseDB/fill_link_database.py`
- `backend/firebaseDB/user_database.py`
- `backend/api/routes/saved_forms.py`
- `backend/api/routes/fill_links.py`
- `backend/api/routes/fill_links_public.py`
- `backend/api/routes/signing.py`
- `backend/api/routes/billing.py`
- template API route and storage flows that depend on template access

### 2.1 Replace downgrade retention with template access policy

Required behavior:

- no grace deadline
- no pending-delete queues
- no purge side effects
- no delete-now route
- no mutation route for keep selection

Required implementation steps:

1. Create a new service layer that computes:
   - accessible template ids
   - locked template ids
   - locked dependent records
2. Reuse the current oldest-first ordering logic:
   - `created_at` ascending
   - `id` ascending for ties
3. Persist the computed access state on the user document.
4. Recompute access state:
   - on profile read
   - on billing downgrade
   - on billing upgrade
   - on saved-form create
   - on saved-form delete

### 2.2 Saved-form access enforcement

Saved-form endpoints must:

- allow listing both accessible and locked templates
- block opening locked templates
- block PDF download of locked templates
- block session creation from locked templates
- block editor snapshot updates on locked templates

Recommended response code:

- `403` with a plan-lock error message

Reason:

- `404` falsely implies deletion
- `409` is workable but less direct than `403` for entitlement lock

### 2.3 Fill By Link owner behavior

Owner-side Fill By Link changes:

- remove active-link cap enforcement
- stop using `active_limit` when creating or updating a link
- stop treating the old per-link response-cap field as a plan quota field
- preserve `response_count` only as lifetime analytics
- block publish or update when the source template is locked
- if a group includes locked templates, block group publish and group open flows until the group composition is valid

For existing links:

- links backed by accessible templates remain usable
- links backed by locked templates are preserved but must be disabled
- if a locked template becomes accessible again after upgrade, the link can be re-enabled if no other scope validation fails

Recommended new closed reason:

- `template_locked`

### 2.4 Fill By Link public submit behavior

Public submit changes:

- load the owning user
- check monthly usage counter for the user and current month
- reject when the next accepted response would exceed the monthly cap
- do not close the link when the monthly cap is exhausted
- keep the link record itself active if the template is accessible
- preserve idempotent retry behavior

The transaction must:

1. resolve the public link
2. confirm the link is active
3. confirm the source template is accessible
4. confirm the monthly usage counter is below cap
5. confirm the attempt id is not already stored
6. write the response
7. increment the monthly usage counter
8. update link lifetime analytics

That transaction ordering matters because accepted responses must remain the only thing that burns monthly quota.

### 2.5 OpenAI base monthly refill behavior

Base refill rules:

- if current month key differs from stored base cycle key and base credits are below 10, set them to 10
- if current month key differs and base credits are already 10 or higher, leave them unchanged
- never reduce credits because of the refill logic
- never increase above 10 because of the refill logic
- do not unlock pro refill credits on base

Base refill must happen transactionally in the same style as the current pro monthly reset so month-boundary races do not overwrite concurrent usage.

### 2.6 Upgrade and downgrade transitions

Downgrade to base:

- set role to `base`
- ensure base credit bucket exists
- apply base monthly refill logic on next read or immediately if desired
- compute accessible first 5 templates
- lock remaining templates
- disable dependent Fill By Links, API endpoints, and signing drafts backed by locked templates
- preserve sent and completed signing records

Upgrade to pro:

- clear template access lock state
- make all templates accessible
- allow previously locked Fill By Links and API endpoints to be reactivated after normal scope validation
- keep all preserved artifacts and historical records intact

### 2.7 Data migration and backfill

Required migration behavior for existing downgrade-retention users:

- `kept_template_ids` become `accessible_template_ids`
- `pending_delete_template_ids` become `locked_template_ids`
- `pending_delete_link_ids` are not preserved as a primary state field
- `grace_ends_at` is discarded
- `downgraded_at` can be preserved as informational history if desired
- auto-closed links with old reasons:
  - reopen if the source template is accessible and the only reason was old downgrade active-link logic
  - keep disabled with `template_locked` if the source template is locked

Important limitation:

- any templates already physically deleted in prior versions are not recoverable through this migration

Acceptance criteria:

- no downgrade path deletes templates
- all lock behavior is deterministic
- monthly Fill By Link quota is enforced at public submit time
- OpenAI base monthly refill is transaction-safe

## Phase 3. Frontend, docs, and user-facing semantics

Goal:

- align every user-facing surface with the new contract

Primary files:

- `frontend/src/services/api.ts`
- `frontend/src/hooks/useDowngradeRetentionRuntime.ts`
- `frontend/src/components/pages/ProfilePage.tsx`
- saved-form browser components
- Fill By Link manager UI
- `backend/README.md`
- `frontend/README.md`
- `frontend/docs/overview.md`
- `frontend/docs/api-routing.md`
- public SEO and plan-limit copy files

### 3.1 Replace the current downgrade-retention UI

Current UI assumptions to remove:

- grace window countdown
- delete-now action
- save kept forms action
- pending-delete wording
- queued-for-purge semantics

Replacement UI:

- informational locked-templates banner or dialog
- explicit count of accessible templates vs locked templates
- visible locked-template rows in the saved-form browser
- upgrade CTA

Recommended messaging:

- “You are on the free plan. The first 5 created templates remain accessible. Additional templates are preserved but locked until upgrade.”

### 3.2 Saved-form browser behavior

Required saved-form browser behavior:

- accessible templates appear normally
- locked templates remain visible
- locked templates show a badge such as `Locked on free plan`
- clicking a locked template shows an upgrade prompt rather than opening the workspace

### 3.3 Profile behavior

Profile changes:

- replace retention summary with template access summary
- show:
  - saved templates max
  - Fill By Link monthly max
  - Fill By Link used this month
  - Fill By Link remaining this month
  - API monthly limits unchanged
  - signing per-document limits unchanged
- remove delete-now and grace deadline actions

### 3.4 Plan docs and SEO copy

Update every public or internal plan summary that currently says:

- active Fill By Link counts
- accepted responses per link
- 3 saved forms on free
- downgrade retention with 30-day purge

Required replacement messaging:

- 5 saved templates on free
- 100 saved templates on premium
- 25 Fill By Link accepted responses per month on free
- 10,000 Fill By Link accepted responses per month on premium
- downgrade locks extra templates instead of deleting them

### 3.5 API route cleanup

Recommended route plan:

- keep `GET /api/profile`
- remove or deprecate:
  - `PATCH /api/profile/downgrade-retention`
  - `POST /api/profile/downgrade-retention/delete-now`

If compatibility is required for one release:

- leave the routes in place but return a clear deprecation error
- update frontend to stop calling them immediately

Acceptance criteria:

- no user-facing copy still implies downgrade deletion
- all plan pages and usage docs match backend enforcement exactly
- no UI action remains for a concept that no longer exists

## Phase 4. QA, migration validation, and rollout

Goal:

- prove the new policy is correct before enabling it broadly

Primary test surfaces:

- backend unit tests
- backend integration tests
- frontend unit tests
- Playwright smoke tests
- Chrome DevTools MCP smoke evidence

### 4.1 Unit tests required

Backend unit tests:

- limits resolution:
  - saved templates `5 / 100`
  - Fill By Link monthly limits `25 / 10000`
- base OpenAI refill:
  - `0 -> 10`
  - `7 -> 10`
  - `10 -> 10`
  - `12 -> 12`
  - former pro with locked refill credits stays locked
- template-access computation:
  - oldest 5 selected
  - tie-break by id
  - fewer than 5 templates means no locked state
  - deleting one of the oldest 5 pulls the next oldest into accessibility
- saved-form access guards:
  - locked template get
  - locked template download
  - locked template session creation
  - locked template editor snapshot update
- Fill By Link submit:
  - accepted response increments monthly counter
  - idempotent attempt replay does not increment monthly counter
  - monthly-cap rejection does not close the link
  - locked-template link rejects cleanly
  - closed link still rejects cleanly
- upgrade and downgrade state transitions:
  - all templates accessible on pro
  - only first 5 accessible on base
  - lock state clears on upgrade

Frontend unit tests:

- profile shows monthly Fill By Link usage numbers
- locked-template rows render correctly
- locked-template click path shows upgrade prompt
- delete-now and grace messaging are gone
- plan-limit cards show new values
- no code still expects mutable retention selection

### 4.2 Integration tests required

Backend integration tests:

- create 7 templates on pro, downgrade to base, verify first 5 accessible and last 2 locked
- upgrade the same user back to pro, verify all 7 accessible
- publish Fill By Link on accessible template, submit until quota is exhausted, verify link remains active but additional submits are rejected
- downgrade mid-month after quota usage already exceeds base limit, verify no reset and no deletion
- former pro with old downgrade-retention state migrates to access-lock state correctly
- signing drafts backed by locked templates are blocked from send, but sent and completed requests remain retained
- API endpoints backed by locked templates are blocked or disabled but preserved
- group behavior when a group contains both accessible and locked templates

### 4.3 Chrome DevTools MCP smoke tests

Smoke tests must follow `mcp/devtools.md` and save screenshots under:

- `mcp/debugging/mcp-screenshots/base-premium-policy-v2/`

Required smoke flows:

1. Downgraded user with 7 templates
   - verify exactly 5 are accessible
   - verify 2 are visible and locked
   - verify a locked template cannot be opened
   - capture screenshot of profile and saved-form browser
2. Fill By Link monthly quota exhaustion
   - use a base user with remaining quota near zero
   - submit one successful response
   - submit the next response and verify a monthly-quota block
   - verify the link itself did not close because of quota exhaustion
3. Upgrade recovery
   - upgrade the same user back to pro
   - verify locked templates become accessible again
   - verify previously disabled dependent records can be reactivated
4. OpenAI credit boundary proof
   - use a test user whose base credits are below 10 at month boundary
   - verify profile shows refill to 10
   - use a second test user above 10 and verify it does not increase

Recommended evidence captured per smoke:

- screenshot path
- timestamp
- account fixture id
- key assertions
- whether the smoke used seeded fixtures or live test setup

### 4.4 Existing smoke-script migration

Existing Playwright downgrade retention smoke scripts currently target purge semantics.

Required script migration:

- replace delete-now assertions with lock-state assertions
- replace grace-period assertions with access-summary assertions
- replace old link-limit assertions with template-lock assertions

Recommended scripts to update or replace:

- `frontend/test/playwright/run_downgrade_retention_real_user_flow.mjs`
- `frontend/test/playwright/run_downgrade_retention_smoke.mjs`
- `frontend/test/playwright/run_downgrade_retention_matrix.mjs`

### 4.5 Rollout sequencing

Recommended rollout order:

1. land policy-v2 backend contract behind a temporary feature flag or policy version gate
2. land frontend compatibility for new fields while still tolerating old fields
3. run migration in staging against seeded downgrade users
4. run full unit and integration test suites
5. run Playwright smoke
6. run Chrome DevTools MCP smoke and save screenshots
7. enable policy-v2 in staging
8. verify metrics and manual QA
9. enable policy-v2 in production
10. remove deprecated retention routes and fields in a follow-up cleanup pass

## 7. Exact edge-case matrix

These are mandatory acceptance cases, not optional nice-to-haves.

### 7.1 Base OpenAI refill edge cases

- user at `0` base credits on new month becomes `10`
- user at `7` base credits on new month becomes `10`
- user at `10` base credits on new month remains `10`
- user at `12` base credits on new month remains `12`
- user downgraded from pro with locked refill credits keeps those refill credits locked
- concurrent month-boundary reads do not double-apply refill logic
- refund after refill does not cause incorrect clamping

### 7.2 Fill By Link monthly quota edge cases

- accepted submission increments monthly usage exactly once
- repeated submit with same `attempt_id` does not increment monthly usage again
- rejection because of monthly cap does not increment usage
- rejection because template is locked does not increment usage
- rejection because link is closed does not increment usage
- month boundary between two responses puts usage into correct month documents
- usage count does not reset on downgrade within the same month
- higher premium cap applies immediately on upgrade without clearing historical current-month usage

### 7.3 Template access edge cases

- fewer than 5 templates means no locked templates
- exactly 5 templates means no locked templates
- 6 templates means only 1 locked
- identical `created_at` values still produce deterministic first 5 through id ordering
- deleting one accessible template reflows access to the next oldest locked template
- saving a new template while already over the base limit keeps the new template locked if the account stays on base

### 7.4 Dependent-record edge cases

- locked template blocks signing draft creation
- locked template blocks signing draft send
- sent/completed signing records remain downloadable if policy allows the owner to access retained artifacts
- locked template disables dependent Fill By Link public submit
- locked template disables dependent API Fill endpoint use
- locked group member prevents group open or group publish if the flow depends on the whole group

## 8. Recommended file-by-file implementation map

Backend:

- `backend/services/limits_service.py`
- `backend/firebaseDB/user_database.py`
- `backend/firebaseDB/fill_link_database.py`
- `backend/api/routes/profile.py`
- `backend/api/routes/saved_forms.py`
- `backend/api/routes/fill_links.py`
- `backend/api/routes/fill_links_public.py`
- `backend/api/routes/signing.py`
- `backend/api/routes/billing.py`
- template API route and supporting database/service files
- replacement for `backend/services/downgrade_retention_service.py`

Frontend:

- `frontend/src/services/api.ts`
- `frontend/src/hooks/useDowngradeRetentionRuntime.ts` or renamed replacement
- `frontend/src/components/pages/ProfilePage.tsx`
- saved-form browser components
- plan-limit config and docs/SEO copy
- Playwright smoke harnesses and fixtures

Documentation:

- `backend/README.md`
- `frontend/README.md`
- `frontend/docs/overview.md`
- `frontend/docs/api-routing.md`
- any public plan pages or SEO route copy that mention old limits

## 9. Suggested follow-up work after this overhaul

These items are intentionally out of scope for the first pass but should remain visible.

- manual pinning of which 5 templates remain accessible on base
- unified quota dashboard showing current-month usage across Fill By Link, API Fill, and OpenAI
- cleanup removal of deprecated legacy limit fields from profile payloads
- cleanup removal of old downgrade-retention route handlers and runtime hooks
- optional future signing monthly quota design, if product still wants it after the rest of the entitlement model stabilizes

## 10. Final recommendation

Implement this as a coherent policy-v2 migration, not as piecemeal edits to the existing downgrade-retention code.

The success criteria are straightforward:

- quotas match the new commercial model exactly
- downgrade never deletes templates
- the first 5 created templates remain accessible on base
- locked templates are visible but inaccessible
- Fill By Link monthly quota burns only on accepted responses
- base OpenAI credits refill to 10 monthly without inflating users already above 10
- API monthly quotas remain unchanged
- signing per-document quotas remain unchanged
- every user-facing surface and every test reflects the new semantics
