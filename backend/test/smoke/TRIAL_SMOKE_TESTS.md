# Free Trial Smoke Tests

Manual tests to run against staging with real Stripe test keys. Use Stripe test
mode cards (`4242 4242 4242 4242`) and the Stripe dashboard or CLI to verify
webhook delivery.

---

## Prerequisites

- Staging environment running with `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` set
- Stripe CLI forwarding webhooks: `stripe listen --forward-to localhost:8000/api/billing/webhook`
- A fresh test account (or clear `trial_used` in Firestore manually between runs)

---

## 1. Fresh signup -> onboarding -> free trial checkout

1. Create a new account (email/password or OAuth).
2. Verify the onboarding page appears with two tabs: **Free** (left) and **Premium** (right, selected by default).
3. Confirm the Premium tab lists all premium features and shows **"Start 7-Day Free Trial"** button.
4. Click **"Start 7-Day Free Trial"**.
5. Complete Stripe Checkout using test card `4242 4242 4242 4242`.
6. Verify redirect back to the app.
7. Open Profile page and confirm:
   - Role shows **Pro**
   - Subscription status shows **trialing**
   - **"Start 7-Day Free Trial"** button is no longer visible
   - Monthly credits are 500

**Expected Stripe state:** Subscription with `status: trialing`, `trial_end` set to 7 days from now.

---

## 2. Profile page trial button visibility

1. Sign in as a **base** user who has never used a trial.
2. Go to Profile -> Billing section.
3. Verify **"Start 7-Day Free Trial"** button is visible with the note: "Try Premium free for 7 days..."
4. Sign in as a **pro** user.
5. Verify the trial button is **not** visible.
6. Sign in as a base user who **has** used a trial (trial_used=true in Firestore).
7. Verify the trial button is **not** visible.

---

## 3. Trial expiry -> downgrade

Use a [Stripe test clock](https://dashboard.stripe.com/test/test-clocks) to simulate trial expiry:

1. Create a test clock customer and attach to a base user.
2. Start a free trial checkout for this user.
3. Advance the test clock past the 7-day trial period with a **declining** card (use `4000 0000 0000 0341`).
4. Verify Stripe sends `customer.subscription.deleted` webhook.
5. Confirm:
   - User role is downgraded to **base**
   - `trial_used` remains **true** in Firestore
   - Downgrade retention is applied (saved forms locked per policy)
   - Profile page shows base tier limits
   - Trial button is **not** visible (trial already used)

---

## 4. Trial -> paid conversion

1. Start with a user in **trialing** status (from test 1 or a test clock).
2. Advance the test clock past the trial period with a **valid** card (`4242 4242 4242 4242`).
3. Verify Stripe sends `customer.subscription.updated` with `status: active`.
4. Verify Stripe sends `invoice.paid` for the first billing cycle.
5. Confirm:
   - User remains **pro**
   - Subscription status changes from `trialing` to `active`
   - Credits are preserved (no double-grant)
   - No service interruption

---

## 5. Invoice paid after trial conversion

1. After test 4, advance the test clock by one billing cycle (1 month).
2. Verify `invoice.paid` webhook fires.
3. Confirm:
   - User remains **pro**
   - Monthly credits are reset to 500
   - Subscription status remains `active`

---

## 6. Double trial prevention

1. Sign in as a base user with `trial_used: true` in Firestore.
2. Attempt to POST `/api/billing/checkout-session` with `{"kind": "free_trial"}`.
3. Verify response is **409** with message containing "already been used".
4. Attempt via curl:
   ```bash
   curl -X POST https://staging.dullypdf.com/api/billing/checkout-session \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"kind": "free_trial"}'
   ```
5. Confirm **409** response.

---

## 7. Onboarding skip -> free path

1. Create a new account.
2. On the onboarding page, click the **Free** tab.
3. Verify free features are listed.
4. Click **"Use DullyPDF for Free"**.
5. Verify the user lands on the upload screen.
6. Verify the onboarding page does **not** appear on next login.
7. Verify Profile page still shows the trial button (trial not used).
