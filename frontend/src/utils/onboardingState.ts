const ONBOARDING_PENDING_KEY = 'dullypdf.onboardingPending';
const ONBOARDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function markOnboardingPending(userId: string): void {
  try {
    localStorage.setItem(
      ONBOARDING_PENDING_KEY,
      JSON.stringify({ userId, ts: Date.now() }),
    );
  } catch {
    // Storage quota or private mode — silently skip.
  }
}

export function consumeOnboardingPending(userId: string): boolean {
  try {
    const raw = localStorage.getItem(ONBOARDING_PENDING_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.userId !== userId) return false;
    if (Date.now() - data.ts > ONBOARDING_MAX_AGE_MS) {
      localStorage.removeItem(ONBOARDING_PENDING_KEY);
      return false;
    }
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    return true;
  } catch {
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
    return false;
  }
}

export function hasOnboardingPending(userId: string): boolean {
  try {
    const raw = localStorage.getItem(ONBOARDING_PENDING_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data.userId !== userId) return false;
    if (Date.now() - data.ts > ONBOARDING_MAX_AGE_MS) {
      localStorage.removeItem(ONBOARDING_PENDING_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function clearOnboardingPending(): void {
  try {
    localStorage.removeItem(ONBOARDING_PENDING_KEY);
  } catch {
    // Ignore.
  }
}
