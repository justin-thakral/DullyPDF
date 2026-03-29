# Signing Monthly Quota Migration Plan

Status: [ ] Proposed

## Why this plan exists

The current signing entitlement is framed as "signer requests per immutable document version". That is harder to explain than the existing monthly Fill By Link and API Fill quotas, and recent browser testing showed that source-version churn can weaken the practical enforcement boundary in owner flows. Product direction is to move signing to the same account-level monthly model used by other capped features.

This should be treated as a product and billing migration, not just a bug patch. The user-facing rule changes from "how many signers can one immutable document support" to "how many signing sends can this account initiate in one month".

## Product decision

- Free accounts get 25 sent signing requests per month.
- Premium accounts (`pro` in code) get 10,000 sent signing requests per month.
- Internal `god` users should remain on an override tier so admin and dev workflows are not accidentally rate-limited.
- Month buckets should stay UTC so signing matches the existing Fill By Link and API Fill reset model.
- Quota is consumed exactly once, when a signing request first transitions to `sent`.
- Draft creation and draft edits do not consume quota.
- Email resend or reminder for the same already-sent request does not consume quota again.
- Reissue that creates a new request record consumes quota when that new request is first sent.
- A sent request keeps its quota charge even if it is later revoked, expires, fails invite delivery, or completes.
- Keep a separate high internal per-document abuse guard so one template cannot create unbounded invite traffic.

## Phase 1: Backend quota model and send-time enforcement

### Goals

- Move plan enforcement from draft creation to send-time.
- Make quota charging idempotent so retries cannot double-charge one request.
- Keep existing signing request creation and audit flows intact where possible.

### Scope

Backend:
- Add `signingRequestsMonthlyMax` to role-limit resolution and profile payloads.
- Add a Firestore month-bucket counter for signing usage, following the same `user_id__YYYY-MM` pattern used by Fill By Link and Template API.
- Add request-level fields that mark whether a request already consumed quota, for example `quota_consumed_at` and `quota_month_key`.
- Enforce the monthly cap in the owner send route at `/api/signing/requests/{request_id}/send`.
- Enforce the same cap in the Fill By Link post-submit signing auto-send path in `backend/api/routes/fill_links_public.py`.
- Convert the current per-document limit service into an internal abuse guard, or retire it from the user-facing plan path entirely.

### Recommended implementation notes

- Charging should be tied to the request state transition, not to email-delivery success. A request can be validly sent even if invite email delivery later fails and the owner shares the link manually.
- The quota increment should happen inside the same transactional boundary that marks the request as sent, or it should use request-level idempotency markers so repeated send attempts remain safe.
- Return a single consistent exhausted-limit response for both owner send and Fill By Link auto-send paths.

## Phase 2: Surface area, migration, and reset behavior

### Goals

- Replace the old per-document messaging everywhere users can see limits.
- Roll the new monthly counter model out without ambiguous mid-month behavior.
- Keep reset behavior aligned with existing monthly product quotas.

### Scope

Frontend and product copy:
- Replace legacy signing limit fields with `signingRequestsMonthlyMax` in public plan snapshots, profile summaries, usage docs, and SEO copy.
- Update any owner or Fill By Link UI that currently implies "per immutable document version".

Backend and configuration:
- Replace or deprecate legacy per-document signing env names in favor of monthly signing env names.
- Update `backend/README.md` so signing is documented as a monthly account quota instead of a per-document cap.
- Decide rollout behavior for the current month: either backfill usage from existing `sent_at` signing records or start the counter fresh on deploy.
- Keep reset behavior based on month-key rollover rather than ad hoc manual cleanup.

### Recommended rollout default

- Default to a fresh-start rollout unless product explicitly needs same-month continuity. It is simpler, easier to explain, and avoids writing a one-off backfill that may miscount revoked or legacy records.

## Phase 3: Hardening, regression coverage, and cleanup

### Goals

- Prove the new model blocks the right actions and resets on time.
- Preserve operational safeguards that monthly quota alone does not cover.
- Remove stale per-document limit references after the migration is stable.

### Scope

Testing:
- Add backend integration coverage for owner send blocked at monthly limit.
- Add backend integration coverage for Fill By Link post-submit signing blocked at the same monthly limit.
- Add coverage that resend/reminder for the same sent request does not double-charge.
- Add coverage that reissue creating a new request record charges once when the new request is sent.
- Add rollover coverage proving the next UTC month restores quota.
- Add concurrency coverage proving duplicate send attempts cannot charge twice.

Operational cleanup:
- Keep a hidden per-document abuse guard with a deliberately high ceiling.
- Preserve the source-version drift bug as a separate follow-up. Monthly quota removes it from plan enforcement, but it still matters for immutable-record integrity and audit clarity.
- Remove dead per-document copy, stale response fields, and obsolete tests after the monthly model is fully in place.

## Non-goals

- Do not count draft creation as monthly usage.
- Do not add self-serve overage packs or signing-credit purchases in this change.
- Do not depend on source-version hashing for plan enforcement after the migration.
- Do not remove internal anti-abuse guardrails just because the public plan model becomes monthly.

## Likely files

- `backend/services/limits_service.py`
- `backend/firebaseDB/signing_database.py`
- `backend/api/routes/signing.py`
- `backend/api/routes/fill_links_public.py`
- `backend/services/fill_link_signing_service.py`
- `frontend/src/config/planLimits.mjs`
- `frontend/src/components/pages/ProfilePage.tsx`
- `frontend/src/components/pages/usageDocsContent.tsx`
- `frontend/src/config/publicRouteSeoData.mjs`
- `backend/README.md`

## Acceptance criteria

- Free accounts are capped at 25 sent signing requests per UTC month.
- Premium accounts are capped at 10,000 sent signing requests per UTC month.
- Draft creation is never blocked by the monthly signing quota.
- Owner send and Fill By Link auto-send both block once the monthly quota is exhausted.
- One request can consume quota at most once.
- The first request in a new UTC month can be sent without manual counter cleanup.
- User-visible plan copy consistently describes signing as a monthly quota.

## Verification

- Backend unit tests for quota-counter helpers and idempotent charge markers.
- Backend integration tests for owner send, Fill By Link auto-send, resend, reissue, and month rollover.
- Chrome DevTools smoke with a disposable dev user that proves exhaustion and reset behavior end to end.
- Manual profile check that surfaced limits and copy match the backend payload.

## Open questions

- Should `god` remain a separate high-ceiling override, or should it intentionally match premium for more realistic internal testing?
- Does product want a fresh-start rollout or a one-time backfill from existing `sent_at` records for the deployment month?
- Should reissue always create a new request record, or do we need one no-new-charge resend path plus one new-charge reissue path?
