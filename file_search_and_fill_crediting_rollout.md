# Search & Fill Crediting — Rollout Checklist

Companion to `file_search_and_fill_crediting.md`. Tracks the Phase 4 rollout
steps so the feature can ship safely once Phase 1–3 land.

## What Phase 1–3 shipped

Phase 1 (server-authoritative accounting):
- `backend/services/limits_service.py` — `resolve_structured_fill_monthly_limit`, `structuredFillMonthlyMax` in `resolve_role_limits`
- `backend/firebaseDB/structured_fill_database.py` — three Firestore collections (`structured_fill_usage_counters`, `structured_fill_events`, `structured_fill_request_guards`) and the transactional `commit_structured_fill_usage` helper
- `backend/api/routes/search_fill_usage.py` — `GET /api/search-fill/precheck` and `POST /api/search-fill/usage`
- `backend/api/routes/profile.py` — exposes `structuredFillCreditsThisMonth`, `structuredFillCreditsRemaining`, `structuredFillUsageMonth`

Phase 2 (frontend enforcement + provenance):
- `frontend/src/services/api.ts` — `SearchFillSourceKind`, `SearchFillPrecheckResponse`, `SearchFillUsageRequest/Response`, `precheckSearchFillUsage`, `commitSearchFillUsage` (maps 429 to typed `ApiError`)
- `frontend/src/utils/signing.ts` — `ReviewedFillContext` gains five provenance fields (`structuredFillEventId`, `structuredFillRequestId`, `structuredFillCountIncrement`, `structuredFillSourceKind`, `structuredFillRecordFingerprint`)
- `frontend/src/components/features/SearchFillModal.tsx` — commits before mutating fields; surfaces 429 inside the modal; emits `structuredFillCommit` through `onAfterFill`
- `frontend/src/hooks/useGroupTemplateCache.ts` — plan → commit → apply path; one commit per group fill with `countIncrement` equal to matched PDF count
- `frontend/src/WorkspaceRuntime.tsx` — wires new modal props and folds provenance into `ReviewedFillContext`
- `frontend/src/components/pages/ProfilePage.tsx` — adds a "Search & Fill monthly credits" limit card
- `frontend/src/config/planLimits.mjs` — `structuredFillMonthlyMax` defaults (50 / 10 000 / 100 000)

Phase 3 (stats, ops, support):
- `internal_stats/collector.py` — `_scan_structured_fill_events`, `UserStatsAccumulator` columns for credits / commits / matched PDFs and per-source-kind splits, global totals in the snapshot payload
- `internal_stats/static/app.js` + `index.html` — three new chart selector options, two new metric cards, two new table columns

Automated test coverage added:
- Backend unit: `backend/test/unit/services/test_structured_fill_limits_blueprint.py` (5), `backend/test/unit/firebase/test_structured_fill_database_blueprint.py` (12), `backend/test/unit/api/test_search_fill_usage_endpoints_blueprint.py` (7), `backend/test/unit/stats_dashboard/test_collector_structured_fill.py` (3)
- Frontend unit: `frontend/test/unit/components/features/test_search_fill_modal.test.tsx` (+4 structured-fill cases), `frontend/test/unit/api/test_api_service.test.ts` (+3 cases)
- Existing full suite: 1 608 backend unit tests + 974 frontend unit tests still pass

## Env vars to set at deploy time

Optional overrides — defaults match the plan (50 / 10 000 / 100 000):

- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_BASE`
- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_PRO`
- `SANDBOX_STRUCTURED_FILL_MONTHLY_MAX_GOD`

Leaving these unset is fine; set them only if product wants a temporary lower
or higher cap during rollout.

## npm scripts for QA

Registered in the repo root `package.json`:

- `npm run test:backend:search-fill-crediting` — targeted unit suite (~27 tests)
- `npm run test:frontend:search-fill-crediting` — vitest suite for modal + API client (49 tests)
- `npm run test:playwright:search-fill-crediting:smoke` — API-only live smoke (see preconditions below)
- `npm run test:playwright:search-fill-crediting:real` — real-user UI flow (single + retry + profile)
- `npm run test:qa:search-fill-crediting` — full orchestration of all three

## Preconditions for the Playwright smoke / real-user flow

Both scripts need:

1. **Local or staging dev stack running** with the Phase 1–3 code loaded.
   - Backend: `npm run backend:dev` (listens on `:8000`).
   - Frontend: `npm run frontend:dev` (Vite on `:5173` proxying `/api/*` to the backend).
2. **A seeded login that exists in the Firebase project the frontend points at.**
   - `env/frontend.dev.env` uses `dullypdf-dev` by default. The account used for
     Phase 4 sign-off (`justin@ttcommercial.com`) currently lives in the prod
     `dullypdf` project, so the smoke 403s against the dev stack until either
     the account is mirrored into `dullypdf-dev` or the scripts are pointed at
     a staging/prod frontend that hosts the Phase 1–3 code.
   - Env overrides: `SMOKE_LOGIN_EMAIL`, `SMOKE_LOGIN_PASSWORD`,
     `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_API_URL`.
3. **A non-empty remaining monthly budget** on the seeded account. The smoke
   debits exactly 1 credit; the real-user flow debits 1 additional credit.
4. **For the real-user flow:** `quickTestFiles/new_patient_forms_1915ccb015.pdf`
   and `new_patient_forms_1915ccb015_mock.csv` must exist (they already do in
   the tracked fixtures). Override with `SEARCH_FILL_SAMPLE_PDF` /
   `SEARCH_FILL_SAMPLE_CSV` to point at a different pair.

## Chrome DevTools live proof procedure

Follow `mcp/devtools.md` to launch a dedicated Chrome with `--remote-debugging-port=9222`
pointed at the running frontend, attach the MCP, then walk through:

1. Sign in with the seeded account and open the workspace.
2. Upload `new_patient_forms_1915ccb015.pdf` from `quickTestFiles/`.
3. Run Rename (AI) so PDF field names line up with CSV columns, or rely on
   the Playwright flow's mocked rename fixture.
4. Upload `new_patient_forms_1915ccb015_mock.csv` as the data source.
5. Open **Search & Fill**, search `Justin`, click **Fill PDF**.
6. Confirm in the DevTools **Network** tab that the following requests fired
   in order:
   - `GET /api/search-fill/precheck?pdfCount=1&sourceKind=csv` → 200 with
     `allowed=true`.
   - `POST /api/search-fill/usage` → 200 with `status="committed"`,
     `countIncrement=1`, and a populated `eventId` / `requestId`.
7. Click **Fill PDF** a second time with the same row to prove the
   idempotency guard works; the retry must return `status="replayed"` with
   the original `eventId` and the same `currentMonthUsage`.
8. Open the **Profile** page and confirm the **Search & Fill monthly credits**
   card shows `Used this month = N+1`.
9. Open a group workspace, run Search & Fill across multiple target PDFs,
   confirm `countIncrement` equals the number of matched target templates
   (not the number of target templates, so unmatched ones are free).
10. Capture screenshots into `mcp/debugging/mcp-screenshots/` named:
    - `search-fill-crediting-single-template.png`
    - `search-fill-crediting-group-fill.png`
    - `search-fill-crediting-profile-usage.png`
    - `search-fill-crediting-network-proof.png`

The Playwright real-user script (`run_search_fill_crediting_real_user_flow.mjs`)
automates steps 1–8 and saves screenshots under
`output/playwright/search-fill-crediting/`; keep both artifacts — the
DevTools captures are the human-verified evidence, the Playwright artifacts
are the reproducible CI-grade evidence.

## Reconciliation checks (must pass before "prod ready")

After running the live proof:

1. **Stats ↔ raw Firestore.** `npm run stats` → Search & Fill Credits card and
   per-user columns must match a manual `gcloud firestore` query against
   `structured_fill_events` filtered by `status == "committed"` for the same
   user and month.
2. **Profile ↔ monthly counter.** `/api/profile`'s
   `structuredFillCreditsThisMonth` must equal the `credit_count` field on
   the user's `structured_fill_usage_counters/{user_id}__{month_key}`
   document.
3. **Retry ↔ request guard.** A replayed commit must leave
   `structured_fill_usage_counters.credit_count` unchanged and produce no
   new `structured_fill_events` document; only the original
   `structured_fill_request_guards/{user_id}__{request_id}` row should exist.
4. **Source-kind splits.** Sum of
   `totalStructuredFill{Csv,Excel,Sql,Json,Txt}Credits` in the stats payload
   must equal `totalStructuredFillCredits`.

If any reconciliation step fails, do **not** declare the feature prod ready.
Pause rollout, capture a transcript, and investigate before continuing.

## Post-release monitoring

- Cloud Logging filter `resource.type="cloud_run_revision" AND
  "Monthly Search & Fill credit limit reached"` — tracks 429 surface area,
  useful for catching runaway retry loops.
- `npm run stats` day-one baseline — snapshot totals the day of rollout to
  compare against week-one totals.
- Firestore monitoring alerts for writes to `structured_fill_events` and
  `structured_fill_usage_counters` — anomalies (0 writes, 10× expected)
  mean either the feature is dead or someone is hammering the commit path.
- Stripe ↔ credit reconciliation: if billing is extended to charge for
  overage later, add an automated daily reconciliation job that sums
  `credit_count` per user over the month and compares with invoiced units.
