/**
 * Shared plan-limit snapshots for public copy and frontend fallbacks.
 *
 * These values mirror the current backend defaults enforced by:
 * - backend/services/limits_service.py
 * - backend/firebaseDB/user_database.py
 * - committed env defaults under config/ and env/
 *
 * Public plan pages are static build-time content, so they cannot read the
 * authenticated profile payload directly. Keep this file aligned with backend
 * defaults whenever tier limits or credit pools change.
 */

const NUMBER_FORMATTER = new Intl.NumberFormat('en-US');

// Phase 5 (D7/D8): API Fill `templateApiMaxPages` is the per-request page cap.
// For group endpoints it gates the *sum* of pages across every template in the
// group, so the typical immigration packet (~30 pages across 8 forms) needs
// the cap to be at least 50 to fit on the free tier. Quota counts each
// materialized PDF as 1 fill against `templateApiRequestsMonthlyMax`, so a
// 7-PDF group fill burns 7 of your monthly fills.
export const FREE_PLAN_LIMITS = Object.freeze({
  detectMaxPages: 5,
  fillableMaxPages: 50,
  savedFormsMax: 5,
  fillLinkResponsesMonthlyMax: 25,
  templateApiActiveMax: 1,
  templateApiRequestsMonthlyMax: 250,
  templateApiMaxPages: 50,
  signingRequestsMonthlyMax: 25,
});

export const PREMIUM_PLAN_LIMITS = Object.freeze({
  detectMaxPages: 100,
  fillableMaxPages: 1000,
  savedFormsMax: 100,
  fillLinkResponsesMonthlyMax: 10000,
  templateApiActiveMax: 20,
  templateApiRequestsMonthlyMax: 10000,
  templateApiMaxPages: 500,
  signingRequestsMonthlyMax: 10000,
});

export const GOD_PLAN_LIMITS = Object.freeze({
  detectMaxPages: 100,
  fillableMaxPages: 1000,
  savedFormsMax: 100,
  fillLinkResponsesMonthlyMax: 100000,
  templateApiActiveMax: 100,
  templateApiRequestsMonthlyMax: 100000,
  templateApiMaxPages: 2000,
  signingRequestsMonthlyMax: 100000,
});

export const FREE_PLAN_CREDITS = Object.freeze({
  availableCredits: 10,
});

export const PREMIUM_PLAN_CREDITS = Object.freeze({
  monthlyCredits: 500,
  refillPackCredits: 500,
});

export function formatPlanLimitCount(value) {
  return NUMBER_FORMATTER.format(value);
}

export function resolvePublicPlanKey(role) {
  const normalized = String(role || '').trim().toLowerCase();
  if (normalized === 'god') return 'god';
  if (normalized === 'pro' || normalized === 'premium') return 'premium';
  return 'free';
}
