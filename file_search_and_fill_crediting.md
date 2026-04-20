# Search And Fill Crediting Plan

## Goal

Add production-accurate Search & Fill usage tracking and monthly quota enforcement for row-driven structured data fills.

This plan covers:

- CSV, Excel, SQL, JSON, and TXT under one product category.
- Free tier limit: `50` Search & Fill credits per month.
- Premium tier limit: `10,000` Search & Fill credits per month.
- God/admin tier limit: `100,000` Search & Fill credits per month.
- Accurate database bookkeeping for who filled what, when, from which source kind, and how many PDFs were charged.
- Visibility in `npm run stats`.
- Test coverage strong enough to treat the crediting path as production-ready.

## Product Position

This must not reuse OpenAI credits.

OpenAI credits already mean something specific in DullyPDF. Search & Fill crediting is a separate quota and should be represented as a separate monthly usage system. The clearest product name is:

- `Search & Fill monthly credits`

Internally, the backend should use a stable feature name such as:

- `structured_fill`

That name fits the current product model because the counted action is "row-driven fill from structured data", not "AI work".

## Accuracy Requirements

If this is going to be billed or shown as a hard account limit, the implementation must be server-authoritative.

The backend must be the source of truth for:

- whether a fill is chargeable
- how many credits it costs
- whether the user has enough credits remaining
- whether a retry should be deduplicated instead of charged twice

The frontend may calculate a provisional match count for UX, but it must not be the final source of truth for charging.

The crediting model should follow these rules:

1. A Search & Fill credit is consumed only when a row-backed fill is explicitly committed.
2. A single-template fill costs `1` credit when it produces at least one matched PDF output target.
3. A group fill costs `N` credits where `N` is the number of matched target PDFs in that group fill.
4. No-match fills cost `0`.
5. TXT schema-only imports cost `0` because they do not currently support Search & Fill rows.
6. SQL imports cost credits only when parsed row data exists. SQL schema-only mapping costs `0`.
7. Retries must be idempotent. The same request must never double-charge.
8. Save, download, and fill-and-sign flows must reuse the already committed Search & Fill usage record instead of charging again.

## Tier Model

| Tier | Monthly Search & Fill credits | Notes |
| --- | ---: | --- |
| Free / Base | 50 | Hard monthly cap |
| Premium / Pro | 10,000 | Hard monthly cap |
| God | 100,000 | Operational ceiling only |

Backend defaults should live in `backend/services/limits_service.py` and frontend fallback mirrors should live in `frontend/src/config/planLimits.mjs`.

Recommended new limit key:

- `structuredFillMonthlyMax`

Recommended env vars:

- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE=50`
- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_PRO=10000`
- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_GOD=100000`

## Chargeable Source Category

All of these source kinds should be grouped under one reporting category:

- `csv`
- `excel`
- `sql`
- `json`
- `txt`

Recommended persisted fields:

- `source_category="structured_data"`
- `source_kind` with the exact source kind above

Important nuance:

- `txt` stays in the grouped category for reporting consistency, but it remains non-chargeable until TXT supports row-backed Search & Fill.
- `respondent` should not be charged by this system in phase 1 because Fill By Link already has its own quota model. It can be added later only if product wants one unified Search & Fill pool across structured data and stored respondents.

## Database Design

### New collections

Add a dedicated Firestore-backed module, recommended file:

- `backend/firebaseDB/structured_fill_database.py`

Add these collections:

1. `structured_fill_usage_counters`
2. `structured_fill_events`
3. `structured_fill_request_guards`

This follows the existing repo pattern used by:

- `fill_link_usage_counters`
- `template_api_usage_counters`
- `signing_usage_counters`

### `structured_fill_usage_counters`

Document id:

- `{user_id}__{month_key}`

Saved fields:

- `user_id`
- `month_key`
- `credit_count`
- `commit_count`
- `matched_pdf_count`
- `created_at`
- `updated_at`

Purpose:

- monthly enforcement
- fast profile reads
- fast owner/admin stats aggregation

### `structured_fill_events`

Document id:

- generated event id such as `sfe_{uuid}`

Saved fields:

- `user_id`
- `request_id`
- `usage_month_key`
- `status`
- `source_category`
- `source_kind`
- `scope_type`
- `scope_id`
- `template_id`
- `group_id`
- `target_template_ids`
- `matched_template_ids`
- `count_increment`
- `match_count`
- `record_label_preview`
- `record_fingerprint`
- `data_source_label`
- `workspace_saved_form_id`
- `search_query_preview`
- `reviewed_fill_context`
- `created_at`
- `updated_at`

Recommended value rules:

- `status` should be one of `committed`, `replayed`, `rejected_no_match`, `rejected_limit`, `rejected_invalid`.
- `count_increment` is the number of credits actually charged.
- `record_label_preview` should be short, sanitized text such as `Justin Thakral`.
- `record_fingerprint` should be a deterministic hash of the selected row identity, not raw row data.
- `search_query_preview` should be optional and truncated. It is operator metadata, not billing truth.

Purpose:

- auditability
- customer support
- reconciling "why was I charged"
- internal stats

### `structured_fill_request_guards`

Document id:

- `{user_id}__{request_id}`

Saved fields:

- `user_id`
- `request_id`
- `event_id`
- `month_key`
- `status`
- `count_increment`
- `created_at`
- `updated_at`
- `expires_at`

Purpose:

- idempotency
- retry safety
- race protection

This guard collection is required if we want the crediting path to be prod-ready and accurate. Without it, browser retries and duplicate submits will eventually double-charge users.

## How Crediting Works

### High-level flow

1. User loads CSV, Excel, SQL-with-rows, or JSON data.
2. Search & Fill computes which target PDFs would actually be filled.
3. Frontend sends a precheck request to the backend.
4. Frontend sends a commit request with a stable `request_id`.
5. Backend transaction verifies the request is new, verifies quota remains, increments the monthly counter, writes the event, and returns a committed usage record.
6. Only after commit succeeds does the frontend apply Search & Fill changes locally.
7. Later save, download, and fill-and-sign flows reuse that committed usage record for provenance only. They do not charge again.

### Required backend endpoints

Recommended new route file:

- `backend/api/routes/search_fill_usage.py`

Recommended endpoints:

1. `GET /api/search-fill/precheck`
2. `POST /api/search-fill/usage`

### `GET /api/search-fill/precheck`

Purpose:

- UI hint only
- shows remaining monthly credits
- validates a proposed `pdfCount`

Inputs:

- `pdfCount`
- `sourceKind`

Response:

- `allowed`
- `monthlyLimit`
- `currentMonthUsage`
- `fillsRemaining`
- `monthKey`
- `sourceKind`
- `sourceCategory`

### `POST /api/search-fill/usage`

Purpose:

- authoritative commit
- atomic debit
- idempotent replay support

Payload:

- `requestId`
- `sourceCategory`
- `sourceKind`
- `scopeType`
- `scopeId`
- `templateId`
- `groupId`
- `targetTemplateIds`
- `matchedTemplateIds`
- `countIncrement`
- `matchCount`
- `recordLabelPreview`
- `recordFingerprint`
- `dataSourceLabel`
- `workspaceSavedFormId`
- `reviewedFillContext`

Response:

- `status`
- `eventId`
- `requestId`
- `countIncrement`
- `monthKey`
- `currentMonthUsage`
- `fillsRemaining`
- `monthlyLimit`

### Commit semantics

The backend must use one transaction for:

- loading the request guard
- rejecting duplicates or replaying an existing result
- checking the monthly counter
- incrementing the monthly counter
- writing the event
- writing the request guard

This is the main production-readiness requirement.

## Frontend Implementation

### Single-template Search & Fill

Current flow applies Search & Fill locally in:

- `frontend/src/components/features/SearchFillModal.tsx`

Planned change:

1. Compute `matchedFieldCount` locally.
2. Resolve whether the fill is chargeable.
3. Build a stable `requestId`.
4. Call `/api/search-fill/usage`.
5. Only on success call `onFieldsChange(...)`.
6. Store the returned `eventId` in runtime state.

### Group Search & Fill

Current group fill path is in:

- `frontend/src/hooks/useGroupTemplateCache.ts`

Planned change:

1. Compute matched target template ids before mutating snapshots.
2. Set `countIncrement = matchedTemplateIds.length`.
3. Commit usage once for the group fill.
4. Apply field mutations only after the backend confirms the debit.

This gives the "normal group batch filling crediting" behavior:

- one group fill
- multiple matched target PDFs
- credits charged equal matched target PDFs

### Runtime provenance

Extend runtime context so later flows can reference the Search & Fill event instead of charging again.

Recommended additions:

- extend `ReviewedFillContext` in `frontend/src/utils/signing.ts`
- add `structuredFillEventId`
- add `structuredFillRequestId`
- add `structuredFillCountIncrement`
- add `sourceKind`
- add `recordFingerprint`

This allows:

- fill-and-sign to know which Search & Fill commit created the frozen output
- support/debugging to trace a signed PDF back to the credited fill event

## Profile And Limit Visibility

Extend `GET /api/profile` to include:

- `structuredFillCreditsThisMonth`
- `structuredFillCreditsRemaining`
- `structuredFillUsageMonth`
- `limits.structuredFillMonthlyMax`

Frontend updates:

- `frontend/src/services/api.ts`
- `frontend/src/components/pages/ProfilePage.tsx`
- `frontend/src/config/planLimits.mjs`

Recommended UI text:

- `Search & Fill monthly credits`
- `Used this month`
- `Remaining this month`

## `npm run stats` Changes

The stats dashboard must show both global and per-user Search & Fill metrics.

Current stats code lives in:

- `internal_stats/collector.py`
- `internal_stats/static/app.js`
- `internal_stats/static/index.html`

### New global metrics

Add:

- `totalStructuredFillCredits`
- `totalStructuredFillCommits`
- `totalStructuredFillMatchedPdfs`
- `totalStructuredFillCsvCredits`
- `totalStructuredFillExcelCredits`
- `totalStructuredFillSqlCredits`
- `totalStructuredFillJsonCredits`
- `totalStructuredFillTxtCredits`

Recommended meaning:

- `totalStructuredFillCredits`: total charged credits across all time
- `totalStructuredFillCommits`: total committed chargeable fill events
- `totalStructuredFillMatchedPdfs`: total PDFs charged across single and group fills

### New per-user metrics

Add to each user row:

- `structuredFillCredits`
- `structuredFillCommits`
- `structuredFillMatchedPdfs`
- `structuredFillCsvCredits`
- `structuredFillExcelCredits`
- `structuredFillSqlCredits`
- `structuredFillJsonCredits`
- `structuredFillTxtCredits`
- `lastStructuredFillAt`

### Dashboard UI changes

Add Search & Fill metrics to:

- metric cards
- selectable chart metrics
- searchable user table

Recommended chart selector options:

- `Structured Fill Credits`
- `Structured Fill Commits`
- `Structured Fill Matched PDFs`

Recommended table column:

- `Search & Fill`

If there is room, split the table into:

- `Search & Fill Credits`
- `Search & Fill Commits`

## What Must Be Saved And What Must Not Be Saved

### Save

- source kind
- grouped source category
- request id
- charged count
- matched template ids
- scope id
- safe record preview
- deterministic record fingerprint
- timestamps

### Do not save

- full row payload
- raw CSV row data
- raw JSON body
- sensitive unbounded search strings

If the selected record is `Justin Thakral`, the event may store:

- `record_label_preview="Justin Thakral"`
- `record_fingerprint="<hash>"`

It should not store the entire row with every field value.

## Four Phase Delivery Plan

## Phase 1: Accounting Model And Hard Limits

Deliverables:

- Add `resolve_structured_fill_monthly_limit(role)` to `backend/services/limits_service.py`.
- Add new Firestore module `backend/firebaseDB/structured_fill_database.py`.
- Add `structured_fill_usage_counters`, `structured_fill_events`, and `structured_fill_request_guards`.
- Add transactional commit and idempotent replay behavior.
- Add `GET /api/search-fill/precheck` and `POST /api/search-fill/usage`.
- Add profile payload support for new Search & Fill monthly usage values.

Acceptance criteria:

- Free users hard-stop at 50 charged Search & Fill credits in a month.
- Premium users hard-stop at 10,000 charged Search & Fill credits in a month.
- Repeating the same `requestId` returns the original result and does not double-charge.
- No-match fills do not create charged usage.
- TXT schema-only usage does not charge.

## Phase 2: Frontend Enforcement And Provenance

Deliverables:

- Update `SearchFillModal.tsx` to commit usage before mutating fields.
- Update group Search & Fill in `useGroupTemplateCache.ts` to charge by matched PDF count.
- Add `structuredFillEventId` and related provenance fields to runtime state.
- Prevent save/download/signing from charging again when they are downstream of an already committed Search & Fill event.
- Surface remaining monthly Search & Fill credits in the profile and Search & Fill UI.

Acceptance criteria:

- Single-template Search & Fill charges `1` when it matches and commits.
- Group Search & Fill charges exactly the number of matched PDFs.
- If commit fails, the frontend does not silently mutate local field state as if the charge succeeded.
- Fill-and-sign records can point back to the credited Search & Fill event for auditability.

## Phase 3: Stats, Ops, And Support Visibility

Deliverables:

- Extend `internal_stats/collector.py`.
- Extend `internal_stats/static/app.js`.
- Extend `internal_stats/static/index.html`.
- Add per-user and global Search & Fill metrics.
- Add support-safe event inspection helpers if needed for admin debugging.

Acceptance criteria:

- `npm run stats` shows all-time Search & Fill metrics globally.
- `npm run stats` shows per-user Search & Fill metrics.
- Metrics distinguish overall Search & Fill credits from API Fill, Fill By Link, and signing.
- Source-kind splits are visible so product can tell whether usage is mostly CSV, Excel, SQL, JSON, or TXT.

## Phase 4: Production Readiness, QA, And Rollout

Deliverables:

- Comprehensive backend and frontend test coverage.
- A real-user Playwright flow covering single-template and group Search & Fill crediting.
- A Chrome DevTools E2E proof flow with screenshots and network verification.
- Rollout checklist with dev verification, prod dry-run verification, and post-release monitoring.

Acceptance criteria:

- Credit counts remain correct under retry, refresh, duplicate click, and group fill paths.
- Stats numbers reconcile with raw Firestore events.
- Profile usage numbers reconcile with monthly counters.
- No double-charge occurs when a Search & Fill user later saves, downloads, or signs the same filled result.
- The path is approved as "prod ready" only after reconciliation checks pass.

## Testing Plan

### Backend unit tests

Add or extend tests around:

- `backend/test/unit/services/test_limits_service_blueprint.py`
- `backend/test/unit/firebase/`
- `backend/test/unit/api/`

Recommended new files:

- `backend/test/unit/firebase/test_structured_fill_database_blueprint.py`
- `backend/test/unit/api/test_search_fill_usage_endpoints_blueprint.py`

Cases:

- free limit resolves to `50`
- premium limit resolves to `10000`
- duplicate `requestId` replays instead of double-charging
- no-match commit charges `0`
- limit exhaustion returns the expected error
- SQL schema-only path charges `0`
- TXT schema-only path charges `0`
- group fill with `N` matched PDFs charges `N`

### Backend integration tests

Recommended new file:

- `backend/test/integration/test_search_fill_crediting_integration.py`

Cases:

- end-to-end commit updates both usage counter and event collection
- same request repeated after a network retry does not double-charge
- concurrent requests near the limit do not overrun the monthly cap
- profile endpoint reflects the latest Search & Fill usage numbers

### Frontend unit tests

Extend existing tests around:

- `frontend/test/unit/components/features/test_search_fill_modal.test.tsx`
- `frontend/test/unit/hooks/test_use_workspace_group_coordinator.test.tsx`
- `frontend/test/unit/services/test_api_service.test.ts`

Recommended new cases:

- single Search & Fill commits usage before mutating fields
- no-match Search & Fill does not call the commit path
- group Search & Fill sends `countIncrement` equal to matched templates
- frontend surfaces limit exhaustion cleanly
- provenance fields are attached after a successful credited fill

### Internal stats unit tests

Extend:

- `backend/test/unit/internal_stats/test_collector.py`
- `backend/test/unit/internal_stats/test_server.py`

Cases:

- collector reads structured fill events correctly
- global totals are correct
- per-user totals are correct
- dashboard payload includes the new keys

### Playwright integration tests

Recommended new scripts:

- `frontend/test/playwright/run_search_fill_crediting_smoke.mjs`
- `frontend/test/playwright/run_search_fill_crediting_real_user_flow.mjs`

Coverage:

- sign in as a seeded user
- open a saved form
- upload CSV or JSON data
- run Search & Fill for one record
- verify profile shows updated Search & Fill usage
- open a group and run a multi-target fill
- verify group charge equals matched PDFs
- retry the same action path and verify no duplicate usage

Recommended npm scripts:

- `test:playwright:search-fill-crediting:smoke`
- `test:playwright:search-fill-crediting:real`
- `test:qa:search-fill-crediting`

### Chrome DevTools E2E proof

Follow:

- `mcp/devtools.md`

Expected proof steps:

1. Start dedicated Chrome with remote debugging.
2. Open the workspace with an authenticated test account.
3. Run a single-template Search & Fill.
4. Confirm network calls to:
   - `/api/search-fill/precheck`
   - `/api/search-fill/usage`
5. Confirm the response returns the committed event id and remaining credits.
6. Open profile and confirm the visible Search & Fill usage changed.
7. Run a group Search & Fill and confirm the debit equals matched PDFs.
8. Capture screenshots into `mcp/debugging/mcp-screenshots`.

Recommended screenshot names:

- `search-fill-crediting-single-template.png`
- `search-fill-crediting-group-fill.png`
- `search-fill-crediting-profile-usage.png`
- `search-fill-crediting-network-proof.png`

## Rollout Checklist

1. Ship backend counters and events behind a feature flag if needed.
2. Verify dev and staging with seeded accounts at boundary limits.
3. Run unit, integration, Playwright, and Chrome DevTools proof flows.
4. Confirm `npm run stats` matches raw Firestore samples.
5. Confirm profile numbers match monthly counter documents.
6. Confirm duplicate request replay is working from logs and Firestore.
7. Remove or relax the rollout flag only after reconciliation passes.

## Definition Of "Prod Ready"

This work is not prod ready until all of the following are true:

- charging is server-authoritative
- commit is transactional
- retries are idempotent
- counters and events reconcile
- profile numbers reconcile
- `npm run stats` numbers reconcile
- single and group Search & Fill both have automated real-user coverage
- Chrome DevTools proof confirms the real network path and visible UI state

If any of those are missing, the feature may be useful, but it is not accurate enough to treat as a production crediting system.
