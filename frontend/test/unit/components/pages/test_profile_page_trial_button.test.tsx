import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ProfilePage from '../../../../src/components/pages/ProfilePage';
import type {
  BillingPlanCatalogItem,
  BillingProfileConfig,
  ProfileLimits,
  SavedFormSummary,
} from '../../../../src/services/api';

const limits: ProfileLimits = {
  detectMaxPages: 10,
  fillableMaxPages: 20,
  savedFormsMax: 5,
  fillLinkResponsesMonthlyMax: 25,
  templateApiActiveMax: 2,
  templateApiRequestsMonthlyMax: 250,
  templateApiMaxPages: 25,
  signingRequestsMonthlyMax: 12,
};

const savedForms: SavedFormSummary[] = [];

const billingConfig: BillingProfileConfig = {
  enabled: true,
  plans: {
    pro_monthly: {
      kind: 'pro_monthly',
      mode: 'subscription',
      priceId: 'price_monthly',
      label: 'Pro Monthly',
      currency: 'usd',
      unitAmount: 1000,
      interval: 'month',
      refillCredits: null,
    },
    pro_yearly: {
      kind: 'pro_yearly',
      mode: 'subscription',
      priceId: 'price_yearly',
      label: 'Pro Yearly',
      currency: 'usd',
      unitAmount: 7500,
      interval: 'year',
      refillCredits: null,
    },
    refill_500: {
      kind: 'refill_500',
      mode: 'payment',
      priceId: 'price_refill',
      label: 'Refill 500 Credits',
      currency: 'usd',
      unitAmount: 900,
      interval: null,
      refillCredits: 500,
    },
  },
};

function renderProfile(overrides: Record<string, unknown> = {}) {
  const defaults = {
    email: 'test@example.com',
    role: 'basic',
    creditsRemaining: 8,
    monthlyCreditsRemaining: 0,
    refillCreditsRemaining: 0,
    availableCredits: 8,
    billingEnabled: billingConfig.enabled,
    billingPlans: billingConfig.plans,
    billingTrialUsed: false,
    limits,
    savedForms,
    onSelectSavedForm: vi.fn(),
    onStartBillingCheckout: vi.fn(),
    onCancelBillingSubscription: vi.fn(),
    onClose: vi.fn(),
  };

  const props = { ...defaults, ...overrides };
  return { ...render(<ProfilePage {...(props as any)} />), props };
}

describe('ProfilePage trial button', () => {
  it('shows trial button for eligible base user', () => {
    renderProfile({ billingTrialUsed: false });

    expect(screen.getByRole('button', { name: 'Start 7-Day Free Trial' })).toBeTruthy();
    expect(screen.getByText(/Try Premium free for 7 days/)).toBeTruthy();
  });

  it('hides trial button for pro user', () => {
    renderProfile({ role: 'pro', billingTrialUsed: false });

    expect(screen.queryByRole('button', { name: 'Start 7-Day Free Trial' })).toBeNull();
  });

  it('hides trial button for god user', () => {
    renderProfile({ role: 'god', billingTrialUsed: false });

    expect(screen.queryByRole('button', { name: 'Start 7-Day Free Trial' })).toBeNull();
  });

  it('hides trial button when trial has been used', () => {
    renderProfile({ billingTrialUsed: true });

    expect(screen.queryByRole('button', { name: 'Start 7-Day Free Trial' })).toBeNull();
    expect(screen.queryByText(/Try Premium free for 7 days/)).toBeNull();
  });

  it('hides trial button when user has active subscription', () => {
    renderProfile({
      billingTrialUsed: false,
      billingHasSubscription: true,
      billingSubscriptionStatus: 'active',
    });

    expect(screen.queryByRole('button', { name: 'Start 7-Day Free Trial' })).toBeNull();
  });

  it('fires onStartBillingCheckout with free_trial when clicked', async () => {
    const user = userEvent.setup();
    const { props } = renderProfile({ billingTrialUsed: false });

    await user.click(screen.getByRole('button', { name: 'Start 7-Day Free Trial' }));

    expect(props.onStartBillingCheckout).toHaveBeenCalledWith('free_trial');
  });

  it('shows busy label when free_trial checkout is in progress', () => {
    renderProfile({
      billingTrialUsed: false,
      billingCheckoutInProgressKind: 'free_trial',
    });

    expect(screen.getByRole('button', { name: 'Starting trial...' })).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'Starting trial...' });
    expect(btn.hasAttribute('disabled')).toBe(true);
  });
});
