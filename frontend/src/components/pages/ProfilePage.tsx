/**
 * User profile overview with tier limits, billing controls, and saved forms.
 */
import React, { useMemo, useState } from 'react';
import './ProfilePage.css';
import type {
  BillingCheckoutKind,
  BillingPlanCatalogItem,
  CreditPricingConfig,
  DowngradeRetentionSummary,
  ProfileLimits,
  SavedFormSummary,
} from '../../services/api';

interface ProfilePageProps {
  email?: string | null;
  role?: string | null;
  creditsRemaining?: number | null;
  monthlyCreditsRemaining?: number | null;
  refillCreditsRemaining?: number | null;
  availableCredits?: number | null;
  refillCreditsLocked?: boolean;
  isLoading?: boolean;
  limits: ProfileLimits;
  savedForms: SavedFormSummary[];
  savedFormsLoading?: boolean;
  allowSavedFormOpen?: boolean;
  onSelectSavedForm: (formId: string) => void;
  onDeleteSavedForm?: (formId: string) => void;
  deletingFormId?: string | null;
  billingCheckoutInProgressKind?: BillingCheckoutKind | null;
  billingCancelInProgress?: boolean;
  billingEnabled?: boolean | null;
  billingHasSubscription?: boolean | null;
  billingSubscriptionStatus?: string | null;
  billingCancelAtPeriodEnd?: boolean | null;
  billingCancelAt?: number | null;
  billingCurrentPeriodEnd?: number | null;
  billingPlans?: Partial<Record<BillingCheckoutKind, BillingPlanCatalogItem>>;
  retention?: DowngradeRetentionSummary | null;
  profileError?: string | null;
  creditPricing?: CreditPricingConfig | null;
  onStartBillingCheckout?: (kind: BillingCheckoutKind) => void;
  onCancelBillingSubscription?: () => void;
  onOpenDowngradeRetention?: () => void;
  onClose: () => void;
  onSignOut?: () => void;
}

type ProfileStat = {
  label: string;
  value: string;
  note: string;
  tone?: 'default' | 'accent';
};

type ProfileDetail = {
  label: string;
  value: string;
  tone?: 'default' | 'accent' | 'warning';
};

type ProfileLimitCard = {
  title: string;
  description: string;
  items: ProfileDetail[];
};

const numberFormatter = new Intl.NumberFormat();

function formatPlanPrice(plan?: BillingPlanCatalogItem): string | null {
  if (!plan) return null;
  const currency = (plan.currency || '').trim();
  const unitAmount = typeof plan.unitAmount === 'number' ? plan.unitAmount : null;
  if (!currency || unitAmount === null || Number.isNaN(unitAmount)) return null;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(unitAmount / 100);
  } catch {
    return null;
  }
}

function formatPlanLabel(plan: BillingPlanCatalogItem | undefined, fallback: string): string {
  const baseLabel = (plan?.label || '').trim() || fallback;
  const priceLabel = formatPlanPrice(plan);
  if (!priceLabel) return baseLabel;
  return `${baseLabel} (${priceLabel})`;
}

function formatTimestampLabel(value?: string | null): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  try {
    return parsed.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return null;
  }
}

function formatCountLabel(value: number | null | undefined): string {
  return numberFormatter.format(value ?? 0);
}

function formatLimitValue(value: number | null | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'Unavailable';
  return formatCountLabel(value);
}

function resolveSavedFormAccessStatus(
  form: SavedFormSummary,
  fallbackStatus?: string | null,
): 'accessible' | 'locked' {
  if (form.locked || form.accessStatus === 'locked' || fallbackStatus === 'locked' || fallbackStatus === 'pending_delete') {
    return 'locked';
  }
  return 'accessible';
}

function toSentenceCase(value: string | null | undefined): string | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  return raw
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

const ProfileStatCard = ({ label, value, note, tone = 'default' }: ProfileStat) => (
  <article className={`profile-stat-card${tone === 'accent' ? ' profile-stat-card--accent' : ''}`}>
    <span className="profile-stat-card__label">{label}</span>
    <strong className="profile-stat-card__value">{value}</strong>
    <p className="profile-stat-card__note">{note}</p>
  </article>
);

const ProfileSummaryList = ({ items }: { items: ProfileDetail[] }) => (
  <dl className="profile-summary-list">
    {items.map((item) => (
      <div key={item.label} className="profile-summary-row">
        <dt className="profile-summary-row__label">{item.label}</dt>
        <dd
          className={[
            'profile-summary-row__value',
            item.tone === 'accent' ? 'profile-summary-row__value--accent' : '',
            item.tone === 'warning' ? 'profile-summary-row__value--warning' : '',
          ].filter(Boolean).join(' ')}
        >
          {item.value}
        </dd>
      </div>
    ))}
  </dl>
);

/**
 * Render a dedicated profile screen with tier details and saved forms.
 */
const ProfilePage: React.FC<ProfilePageProps> = ({
  email,
  role,
  creditsRemaining,
  monthlyCreditsRemaining,
  refillCreditsRemaining,
  availableCredits,
  refillCreditsLocked = false,
  isLoading = false,
  limits,
  savedForms,
  savedFormsLoading = false,
  allowSavedFormOpen = true,
  onSelectSavedForm,
  onDeleteSavedForm,
  deletingFormId,
  billingCheckoutInProgressKind = null,
  billingCancelInProgress = false,
  billingEnabled = null,
  billingHasSubscription = null,
  billingSubscriptionStatus = null,
  billingCancelAtPeriodEnd = null,
  billingCancelAt = null,
  billingCurrentPeriodEnd = null,
  billingPlans,
  retention = null,
  profileError = null,
  creditPricing,
  onStartBillingCheckout,
  onCancelBillingSubscription,
  onOpenDowngradeRetention,
  onClose,
  onSignOut,
}) => {
  const [query, setQuery] = useState('');
  const normalizedRole = role === 'god' ? 'God' : role === 'pro' ? 'Pro' : 'Basic';
  const initial = (email || 'U').charAt(0).toUpperCase();
  const isGod = role === 'god';
  const isPro = role === 'pro';
  const hasBillingSubscription = billingHasSubscription === true;
  const cancelScheduled = billingCancelAtPeriodEnd === true;
  const billingStatus = (billingSubscriptionStatus || '').trim().toLowerCase() || null;
  const cancelEffectiveAt =
    typeof billingCancelAt === 'number'
      ? billingCancelAt
      : (typeof billingCurrentPeriodEnd === 'number' ? billingCurrentPeriodEnd : null);
  const billingBusy = billingCheckoutInProgressKind !== null || billingCancelInProgress;
  const cancelButtonLabel = billingCancelInProgress
    ? 'Canceling...'
    : (cancelScheduled ? 'Cancelled' : (isPro ? 'Cancel Pro Subscription' : 'Cancel Subscription'));
  const resolvedAvailableCredits =
    typeof availableCredits === 'number' ? availableCredits : (creditsRemaining ?? 0);
  const fillLinkResponsesMonthlyLimit = limits.fillLinkResponsesMonthlyMax;
  const creditsLabel = isGod ? 'Unlimited' : formatCountLabel(resolvedAvailableCredits);
  const monthlyLabel = isGod ? 'Unlimited' : formatCountLabel(monthlyCreditsRemaining);
  const refillLabel = isGod ? 'Unlimited' : formatCountLabel(refillCreditsRemaining);
  const pricing = creditPricing ?? {
    pageBucketSize: 5,
    renameBaseCost: 1,
    remapBaseCost: 1,
    renameRemapBaseCost: 2,
  };
  const monthlyPlan = billingPlans?.pro_monthly;
  const yearlyPlan = billingPlans?.pro_yearly;
  const refillPlan = billingPlans?.refill_500;
  const monthlyPlanAvailable = Boolean(monthlyPlan);
  const yearlyPlanAvailable = Boolean(yearlyPlan);
  const refillPlanAvailable = Boolean(refillPlan);
  const monthlyPlanLabel = formatPlanLabel(monthlyPlan, 'Pro Monthly');
  const yearlyPlanLabel = formatPlanLabel(yearlyPlan, 'Pro Yearly');
  const refillPlanLabel = formatPlanLabel(refillPlan, 'Refill 500 Credits');
  const cancelEffectiveDateLabel = useMemo(() => {
    if (!cancelEffectiveAt) return null;
    try {
      return new Date(cancelEffectiveAt * 1000).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return null;
    }
  }, [cancelEffectiveAt]);
  const accessibleTemplateCount =
    retention?.accessibleTemplateIds?.length
    ?? retention?.counts.keptTemplates
    ?? 0;
  const lockedTemplateCount =
    retention?.lockedTemplateIds?.length
    ?? retention?.counts.pendingTemplates
    ?? 0;
  const lockedLinkCount =
    retention?.lockedLinkIds?.length
    ?? retention?.counts.pendingLinks
    ?? 0;
  const affectedSigningRequestCount = retention?.counts.affectedSigningRequests ?? 0;
  const affectedSigningDraftCount = retention?.counts.affectedSigningDrafts ?? 0;
  const retainedSigningRequestCount = retention?.counts.retainedSigningRequests ?? 0;
  const retentionStatusByFormId = useMemo(() => {
    const next = new Map<string, string>();
    for (const template of retention?.templates ?? []) {
      next.set(template.id, template.accessStatus || template.status);
    }
    return next;
  }, [retention?.templates]);
  const lockedSavedFormsCount = useMemo(
    () => savedForms.reduce((count, form) => count + (
      resolveSavedFormAccessStatus(form, retentionStatusByFormId.get(form.id)) === 'locked' ? 1 : 0
    ), 0),
    [retentionStatusByFormId, savedForms],
  );
  const accessibleSavedFormsCount = Math.max(0, savedForms.length - lockedSavedFormsCount);
  const filteredForms = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return savedForms;
    return savedForms.filter((form) => form.name.toLowerCase().includes(trimmed));
  }, [query, savedForms]);

  const heroDescription = isGod
    ? 'God tier bypasses credit enforcement and exposes the highest workflow limits.'
    : isPro
      ? 'Your profile tracks credits, saved templates, Fill By Link, API Fill, signing, and billing state in one place.'
      : 'Upgrade and storage decisions are driven from this profile page, with backend-enforced limits for PDFs, saved forms, Fill By Link, API Fill, signing, and credits kept in sync.';
  const subscriptionSummary = isGod
    ? 'Bypassed for God tier'
    : hasBillingSubscription
      ? `${cancelScheduled ? 'Cancels' : 'Active'}${cancelEffectiveDateLabel ? ` ${cancelScheduled ? 'on' : 'through'} ${cancelEffectiveDateLabel}` : ''}`
      : 'No active subscription';
  const billingSummary = isGod
    ? 'Billing controls hidden for God tier'
    : billingEnabled === true
      ? 'Stripe billing available'
      : billingEnabled === false
        ? 'Stripe billing unavailable'
        : 'Billing status loading';
  const subscriptionStatusLabel = billingStatus ? toSentenceCase(billingStatus) : null;

  const overviewStats: ProfileStat[] = [
    {
      label: 'Available credits',
      value: creditsLabel,
      note: isGod ? 'God tier bypasses OpenAI credit consumption.' : 'Server-enforced credits available for Rename, Remap, and combined runs.',
      tone: 'accent',
    },
    {
      label: 'Saved templates',
      value: `${formatCountLabel(savedForms.length)} / ${formatCountLabel(limits.savedFormsMax)}`,
      note: 'Templates stored in your profile and available to reopen or publish.',
    },
    {
      label: 'Fill By Link / month',
      value: formatLimitValue(fillLinkResponsesMonthlyLimit),
      note: 'Accepted respondent submissions allowed across all published Fill By Link forms each month.',
    },
    {
      label: 'Active API endpoints',
      value: formatLimitValue(limits.templateApiActiveMax),
      note: 'Template-scoped API Fill endpoints that can stay published at once.',
    },
  ];

  const enforcedLimitCards: ProfileLimitCard[] = [
    {
      title: 'Templates and PDFs',
      description: 'Limits tied to storage and PDF processing inside the workspace.',
      items: [
        {
          label: 'Saved forms',
          value: `${formatCountLabel(savedForms.length)} used / ${formatLimitValue(limits.savedFormsMax)} max`,
          tone: 'accent',
        },
        {
          label: 'Detect pages / PDF',
          value: formatLimitValue(limits.detectMaxPages),
        },
        {
          label: 'Fillable pages / PDF',
          value: formatLimitValue(limits.fillableMaxPages),
        },
      ],
    },
    {
      title: 'Fill By Link and API Fill',
      description: 'Limits for hosted respondent links and template-scoped JSON-to-PDF endpoints.',
      items: [
        {
          label: 'Published Fill By Links',
          value: 'No plan cap',
        },
        {
          label: 'Responses / month',
          value: formatLimitValue(fillLinkResponsesMonthlyLimit),
        },
        {
          label: 'Active API endpoints',
          value: formatLimitValue(limits.templateApiActiveMax),
        },
        {
          label: 'API fills / month',
          value: formatLimitValue(limits.templateApiRequestsMonthlyMax),
        },
        {
          label: 'API pages / request',
          value: formatLimitValue(limits.templateApiMaxPages),
        },
      ],
    },
    {
      title: 'Signing and credits',
      description: 'Limits for monthly signing volume and backend-enforced OpenAI credit pools.',
      items: [
        {
          label: 'Signing requests / month',
          value: formatLimitValue(limits.signingRequestsMonthlyMax),
        },
        {
          label: 'Available credits',
          value: creditsLabel,
          tone: 'accent',
        },
        {
          label: 'Monthly credits remaining',
          value: monthlyLabel,
        },
        {
          label: 'Refill credits remaining',
          value: refillLabel,
        },
      ],
    },
  ];

  const accountSummaryItems: ProfileDetail[] = [
    { label: 'Role', value: `${normalizedRole} tier`, tone: 'accent' },
    { label: 'Email', value: email || 'No email on file' },
    { label: 'Saved forms', value: formatCountLabel(savedForms.length) },
    { label: 'Billing', value: billingSummary, tone: billingEnabled === false ? 'warning' : 'default' },
    { label: 'Subscription', value: subscriptionSummary },
    ...(subscriptionStatusLabel ? [{ label: 'Status', value: subscriptionStatusLabel }] : []),
  ];

  const pricingSummaryItems: ProfileDetail[] = [
    { label: 'Rename', value: `${pricing.renameBaseCost} credit${pricing.renameBaseCost === 1 ? '' : 's'}` },
    { label: 'Remap', value: `${pricing.remapBaseCost} credit${pricing.remapBaseCost === 1 ? '' : 's'}` },
    { label: 'Rename + Remap', value: `${pricing.renameRemapBaseCost} credit${pricing.renameRemapBaseCost === 1 ? '' : 's'}` },
    { label: 'Billing bucket', value: `Per ${pricing.pageBucketSize} page${pricing.pageBucketSize === 1 ? '' : 's'}` },
  ];

  return (
    <div className="profile-page">
      <div className="profile-shell">
        <section className="profile-hero">
          <div className="profile-hero__identity">
            <div className="profile-avatar" aria-hidden="true">
              {initial}
            </div>
            <div className="profile-hero__copy">
              <p className="profile-hero__eyebrow">Account overview</p>
              <h1 className="profile-hero__title">{email || 'User profile'}</h1>
              <p className="profile-hero__description">{heroDescription}</p>
              <div className="profile-chip-row">
                <span className="profile-chip profile-chip--accent">{normalizedRole} tier</span>
                <span className="profile-chip">{formatCountLabel(savedForms.length)} saved forms</span>
                <span className="profile-chip">{formatLimitValue(fillLinkResponsesMonthlyLimit)} Fill By Link responses / month</span>
              </div>
            </div>
          </div>
          <div className="profile-hero__actions">
            <button type="button" className="profile-button profile-button--back" onClick={onClose}>
              Return to workspace
            </button>
            {onSignOut ? (
              <button type="button" className="profile-button profile-button--ghost" onClick={onSignOut}>
                Sign out
              </button>
            ) : null}
          </div>
        </section>

        <div className="profile-content-grid">
          <div className="profile-main-column">
            {isLoading ? (
              <div className="profile-banner profile-banner--info" role="status" aria-live="polite">
                Loading profile details...
              </div>
            ) : null}
            {profileError ? (
              <div className="profile-banner profile-banner--error" role="status" aria-live="polite">
                Profile refresh failed: {profileError}
              </div>
            ) : null}

            <section className="profile-panel">
              <div className="profile-panel__header">
                <div>
                  <p className="profile-panel__eyebrow">Snapshot</p>
                  <h2>Current account state</h2>
                  <p>Core limits and usage signals that affect daily workflow decisions.</p>
                </div>
              </div>
              <div className="profile-stat-grid">
                {overviewStats.map((stat) => (
                  <ProfileStatCard key={stat.label} {...stat} />
                ))}
              </div>
            </section>

            <section className="profile-panel">
              <div className="profile-panel__header">
                <div>
                  <p className="profile-panel__eyebrow">Limits</p>
                  <h2>All enforced limits</h2>
                  <p>These values come from the backend and represent the limits the workspace currently enforces for this account.</p>
                </div>
              </div>
              <div className="profile-limit-grid">
                {enforcedLimitCards.map((card) => (
                  <article key={card.title} className="profile-limit-card">
                    <div className="profile-limit-card__header">
                      <h3>{card.title}</h3>
                      <p>{card.description}</p>
                    </div>
                    <ProfileSummaryList items={card.items} />
                  </article>
                ))}
              </div>
            </section>

            {!isGod && billingEnabled === true ? (
              <section className="profile-panel">
                <div className="profile-panel__header">
                  <div>
                    <p className="profile-panel__eyebrow">Billing</p>
                    <h2>Stripe billing controls</h2>
                    <p>Manage Pro access and refill purchases without leaving the profile workspace.</p>
                  </div>
                </div>
                <div className="profile-billing-actions">
                  <button
                    type="button"
                    className="profile-button"
                    onClick={() => onStartBillingCheckout?.('pro_monthly')}
                    disabled={!onStartBillingCheckout || billingBusy || isPro || !monthlyPlanAvailable}
                  >
                    {!monthlyPlanAvailable
                      ? 'Pro Monthly unavailable'
                      : (billingCheckoutInProgressKind === 'pro_monthly'
                        ? 'Starting checkout...'
                        : (isPro
                          ? `${monthlyPlanLabel} (cancel current first)`
                          : `Upgrade to ${monthlyPlanLabel}`))}
                  </button>
                  <button
                    type="button"
                    className="profile-button profile-button--secondary"
                    onClick={() => onStartBillingCheckout?.('pro_yearly')}
                    disabled={!onStartBillingCheckout || billingBusy || isPro || !yearlyPlanAvailable}
                  >
                    {!yearlyPlanAvailable
                      ? 'Pro Yearly unavailable'
                      : (billingCheckoutInProgressKind === 'pro_yearly'
                        ? 'Starting checkout...'
                        : (isPro
                          ? `${yearlyPlanLabel} (cancel current first)`
                          : `Upgrade to ${yearlyPlanLabel}`))}
                  </button>
                  <button
                    type="button"
                    className="profile-button"
                    onClick={() => onStartBillingCheckout?.('refill_500')}
                    disabled={!onStartBillingCheckout || !isPro || billingBusy || !refillPlanAvailable}
                  >
                    {!refillPlanAvailable
                      ? 'Refill unavailable'
                      : (billingCheckoutInProgressKind === 'refill_500' ? 'Starting checkout...' : refillPlanLabel)}
                  </button>
                  <button
                    type="button"
                    className="profile-button profile-button--danger"
                    onClick={() => onCancelBillingSubscription?.()}
                    disabled={!onCancelBillingSubscription || billingBusy || !hasBillingSubscription}
                  >
                    {cancelButtonLabel}
                  </button>
                </div>
                <div className="profile-note-stack">
                  {!isPro ? (
                    <p className="profile-note">
                      Credit refills are available only with an active Pro subscription.
                    </p>
                  ) : null}
                  {hasBillingSubscription && cancelScheduled ? (
                    <p className="profile-note">
                      Cancellation is scheduled for period end{cancelEffectiveDateLabel ? ` (${cancelEffectiveDateLabel})` : ''}.
                    </p>
                  ) : null}
                  {isPro && hasBillingSubscription && !cancelScheduled ? (
                    <p className="profile-note">
                      Active Pro subscription detected. Cancel the current subscription before starting a new Pro checkout.
                    </p>
                  ) : null}
                  {!hasBillingSubscription ? (
                    <p className="profile-note">
                      Cancellation becomes available after subscription linkage is synchronized.
                    </p>
                  ) : null}
                  {hasBillingSubscription && !isPro ? (
                    <p className="profile-note">
                      A subscription is linked to this profile. You can still cancel it while role sync catches up.
                    </p>
                  ) : null}
                  {subscriptionStatusLabel ? (
                    <p className="profile-note">Subscription status: {subscriptionStatusLabel}.</p>
                  ) : null}
                  {!monthlyPlanAvailable || !yearlyPlanAvailable || !refillPlanAvailable ? (
                    <p className="profile-note">
                      Some billing plans are currently unavailable due to configuration.
                    </p>
                  ) : null}
                  {refillCreditsLocked ? (
                    <p className="profile-note">
                      You have stored refill credits. Upgrade back to Pro to use them.
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {!isGod && billingEnabled === false && !isLoading ? (
              <section className="profile-panel">
                <div className="profile-panel__header">
                  <div>
                    <p className="profile-panel__eyebrow">Billing</p>
                    <h2>Stripe billing unavailable</h2>
                    <p>Billing configuration is currently unavailable for this environment.</p>
                  </div>
                </div>
              </section>
            ) : null}

            {!isGod && billingEnabled === null && !isLoading ? (
              <section className="profile-panel">
                <div className="profile-panel__header">
                  <div>
                    <p className="profile-panel__eyebrow">Billing</p>
                    <h2>Billing status pending</h2>
                    <p>
                      {profileError
                        ? 'Billing details are temporarily unavailable because the profile payload could not refresh.'
                        : 'Billing status is still loading from the backend.'}
                    </p>
                  </div>
                </div>
              </section>
            ) : null}

            {retention ? (
              <section className="profile-panel profile-panel--retention">
                <div className="profile-panel__header">
                  <div>
                    <p className="profile-panel__eyebrow">Template access</p>
                    <h2>Base plan access locks</h2>
                    <p>
                      {accessibleTemplateCount} saved form{accessibleTemplateCount === 1 ? '' : 's'} stay accessible on
                      base. {lockedTemplateCount} saved form{lockedTemplateCount === 1 ? '' : 's'} and {lockedLinkCount}{' '}
                      linked Fill By Link record{lockedLinkCount === 1 ? '' : 's'} stay preserved but locked until you
                      upgrade.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-button"
                    onClick={onOpenDowngradeRetention}
                    disabled={!onOpenDowngradeRetention}
                  >
                    Review locked templates
                  </button>
                </div>
                <p className="profile-panel__supporting-copy">
                  Base accounts keep the earliest-created {retention.savedFormsLimit} saved form
                  {retention.savedFormsLimit === 1 ? '' : 's'} accessible. Locked templates are preserved in place
                  rather than deleted.
                </p>
                {affectedSigningRequestCount ? (
                  <p className="profile-panel__supporting-copy">
                    {affectedSigningDraftCount ? (
                      <>
                        {affectedSigningDraftCount} signing draft{affectedSigningDraftCount === 1 ? '' : 's'} tied to
                        locked saved forms cannot be sent until you upgrade and restore access.
                      </>
                    ) : null}
                    {retainedSigningRequestCount ? (
                      <>
                        {' '}
                        {retainedSigningRequestCount} sent or completed signing request
                        {retainedSigningRequestCount === 1 ? '' : 's'} stay retained.
                      </>
                    ) : null}
                  </p>
                ) : null}
              </section>
            ) : null}

            <section className="profile-panel">
              <div className="profile-panel__header">
                <div>
                  <p className="profile-panel__eyebrow">Saved templates</p>
                  <h2>Saved forms</h2>
                  <p>
                    {savedFormsLoading && savedForms.length === 0
                      ? 'Loading saved forms from the backend...'
                      : `${formatCountLabel(filteredForms.length)} of ${formatCountLabel(savedForms.length)} saved forms shown`}
                  </p>
                  {retention ? (
                    <p className="profile-panel__supporting-copy">
                      {formatCountLabel(accessibleSavedFormsCount)} accessible and {formatCountLabel(lockedSavedFormsCount)} locked on the current base plan.
                    </p>
                  ) : null}
                  {!allowSavedFormOpen ? (
                    <p className="profile-panel__supporting-copy">
                      Opening saved forms is desktop-only. Increase window width above 900px to reopen templates.
                    </p>
                  ) : null}
                </div>
                <div className="profile-search">
                  <label className="profile-search__label" htmlFor="saved-form-search">
                    Search saved forms
                  </label>
                  <input
                    type="search"
                    id="saved-form-search"
                    name="saved-form-search"
                    placeholder="Search by template name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    aria-label="Search saved forms"
                  />
                </div>
              </div>

              {savedFormsLoading && savedForms.length === 0 ? (
                <div className="profile-empty" role="status" aria-live="polite">
                  Loading saved forms while the backend responds...
                </div>
              ) : filteredForms.length === 0 ? (
                <div className="profile-empty">
                  No saved forms match your search.
                </div>
              ) : (
                <div className="profile-saved-list" role="list">
                  {filteredForms.map((form) => {
                    const isDeleting = deletingFormId === form.id;
                    const createdLabel = formatTimestampLabel(form.createdAt);
                    const retentionStatus = retentionStatusByFormId.get(form.id) ?? null;
                    const accessStatus = resolveSavedFormAccessStatus(form, retentionStatus);
                    const locked = accessStatus === 'locked';
                    const accessStatusLabel = retention
                      ? (locked ? 'Locked on base' : 'Accessible on base')
                      : null;
                    return (
                      <article
                        key={form.id}
                        className={[
                          'saved-form-row',
                          locked ? 'saved-form-row--locked' : '',
                          retention && !locked ? 'saved-form-row--accessible' : '',
                        ].filter(Boolean).join(' ')}
                        role="listitem"
                      >
                        <div className="saved-form-row__info">
                          {allowSavedFormOpen && !locked ? (
                            <button
                              type="button"
                              className="saved-form-row__name"
                              onClick={() => onSelectSavedForm(form.id)}
                              title={form.name}
                              disabled={isDeleting}
                            >
                              {form.name}
                            </button>
                          ) : (
                            <span className="saved-form-row__name saved-form-row__name--static" title={form.name}>
                              {form.name}
                            </span>
                          )}
                          <div className="saved-form-row__meta">
                            <span>{createdLabel ? `Saved ${createdLabel}` : 'Saved date unavailable'}</span>
                            {accessStatusLabel ? (
                              <span
                                className={[
                                  'saved-form-row__badge',
                                  locked ? 'saved-form-row__badge--locked' : 'saved-form-row__badge--accessible',
                                ].join(' ')}
                              >
                                {accessStatusLabel}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <div className="saved-form-row__actions">
                          {allowSavedFormOpen ? (
                            <button
                              type="button"
                              className="profile-button profile-button--secondary"
                              onClick={() => {
                                if (locked) {
                                  onOpenDowngradeRetention?.();
                                  return;
                                }
                                onSelectSavedForm(form.id);
                              }}
                              disabled={isDeleting || (locked && !onOpenDowngradeRetention)}
                            >
                              {locked ? 'Review lock' : 'Open'}
                            </button>
                          ) : null}
                          {onDeleteSavedForm && !locked ? (
                            <button
                              type="button"
                              className="profile-button profile-button--danger"
                              onClick={() => onDeleteSavedForm(form.id)}
                              aria-label={`Delete saved form ${form.name}`}
                              disabled={isDeleting}
                            >
                              {isDeleting ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <aside className="profile-sidebar">
            <section className="profile-panel profile-panel--sidebar">
              <div className="profile-panel__header">
                <div>
                  <p className="profile-panel__eyebrow">Summary</p>
                  <h2>Account details</h2>
                  <p>Quick reference for the profile state currently loaded in the workspace.</p>
                </div>
              </div>
              <ProfileSummaryList items={accountSummaryItems} />
            </section>

            <section className="profile-panel profile-panel--sidebar">
              <div className="profile-panel__header">
                <div>
                  <p className="profile-panel__eyebrow">Pricing rules</p>
                  <h2>Credit consumption</h2>
                  <p>OpenAI actions are billed by backend-configured page buckets.</p>
                </div>
              </div>
              <ProfileSummaryList items={pricingSummaryItems} />
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;
