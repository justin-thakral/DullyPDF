# PDF Download Quota Smoke Tests

Use these after the backend quota endpoints and frontend download callers are deployed to `dullypdf-dev`.
The goal is to prove real auth, Stripe entitlement state, profile usage, and PDF download endpoints agree before prod rollout.
The automated integration counterpart is `backend/test/integration/test_pdf_download_quota_smoke_integration.py`.

## Preconditions

- Run against `dullypdf-dev` first.
- Use test accounts only.
- Use the current backend UTC month key (`YYYY-MM`) when seeding `pdf_download_usage_counters`.
- Confirm `/api/profile` returns `limits.pdfDownloadsMonthlyMax`, `pdfDownloadsThisMonth`, `pdfDownloadsRemaining`, `pdfDownloadUsageMonth`, `pdfDownloadWorkspaceThisMonth`, `pdfDownloadGroupThisMonth`, `pdfDownloadBatchesThisMonth`, and `pdfDownloadResetAt`.

## 1. Free Limit

1. Seed a base user with current-month usage `24`.
2. Sign in as that user and download one workspace PDF.
3. Confirm the download succeeds and Profile shows `25 / 25`.
4. Confirm `POST /api/forms/materialize` for save/internal materialization does not increment `pdf_download_usage_counters`.
5. Attempt another workspace PDF download.
6. Confirm the UI shows the upgrade-focused `25 generated PDF downloads` quota message.
7. Confirm Firestore still has `download_count=25` and the rejected event status is `rejected_limit`.

## 2. Premium Unlimited

1. Seed a Pro user with current-month usage above `25`.
2. Sign in and download one workspace PDF.
3. Confirm the download succeeds.
4. Confirm Profile renders generated PDF downloads as `Unlimited` while preserving the usage month/count.
5. Confirm the response omits remaining/limit headers and Profile keeps `pdfDownloadsRemaining=null`.

## 3. Terminal Downgrade

1. Seed a Pro user with current-month usage above `25`.
2. Send a signed `customer.subscription.updated` or `customer.subscription.deleted` webhook with a terminal status such as `unpaid` or `canceled`.
3. Confirm `/api/profile` reports role/base limits after webhook fulfillment.
4. Attempt a workspace PDF download.
5. Confirm the request is blocked and the existing current-month counter was not reset.

## 4. Group ZIP All-Or-Nothing

1. Seed a base user with current-month usage `23`.
2. Open a saved group with three templates.
3. Attempt a group ZIP download.
4. Confirm the request is blocked before any ZIP is delivered.
5. Confirm the rejected event reports `pdf_count=3` and the counter remains `23`.

## Support Checks

- `pdf_download_usage_counters/{user_id}__{month_key}` shows the current counter.
- `pdf_download_events` shows source, export mode, PDF count, status, and metadata.
- `pdf_download_request_guards` shows duplicate request ids; repeated request ids should replay instead of incrementing.
- The internal stats dashboard shows current-month downloads, near-cap base users, quota blocks, and group ZIP PDF volume.
