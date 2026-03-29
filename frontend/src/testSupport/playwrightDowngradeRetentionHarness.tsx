import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import DowngradeRetentionDialog from '../components/features/DowngradeRetentionDialog';
import ProfilePage from '../components/pages/ProfilePage';
import type { DowngradeRetentionSummary, ProfileLimits, SavedFormSummary } from '../services/api';

type HarnessEvent =
  | { type: 'close' }
  | { type: 'save'; keptTemplateIds: string[] }
  | { type: 'reactivate' }
  | { type: 'profile-open' };

type HarnessWindow = Window & {
  __PW_RETENTION_SUMMARY__?: DowngradeRetentionSummary | null;
  __PW_RETENTION_EVENTS__?: HarnessEvent[];
  __PW_RETENTION_LIMITS__?: Partial<ProfileLimits>;
  __PW_RETENTION_SAVED_FORMS__?: SavedFormSummary[];
  __PW_RETENTION_PROFILE__?: {
    email?: string;
    role?: string;
    creditsRemaining?: number;
    monthlyCreditsRemaining?: number;
    refillCreditsRemaining?: number;
    availableCredits?: number;
    refillCreditsLocked?: boolean;
  };
  __PW_RETENTION_OPTIONS__?: {
    billingEnabled?: boolean;
    initiallyOpen?: boolean;
    savingSelection?: boolean;
    checkoutInProgress?: boolean;
    reactivateLabel?: string;
  };
};

const harnessWindow = window as HarnessWindow;

const defaultRetention: DowngradeRetentionSummary = {
  status: 'grace_period',
  policyVersion: 2,
  downgradedAt: '2026-03-01T00:00:00Z',
  graceEndsAt: null,
  daysRemaining: 0,
  savedFormsLimit: 5,
  keptTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3', 'tpl-4', 'tpl-5'],
  pendingDeleteTemplateIds: ['tpl-6', 'tpl-7'],
  pendingDeleteLinkIds: ['link-6'],
  accessibleTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3', 'tpl-4', 'tpl-5'],
  lockedTemplateIds: ['tpl-6', 'tpl-7'],
  lockedLinkIds: ['link-6'],
  selectionMode: 'oldest_created',
  manualSelectionAllowed: false,
  counts: {
    keptTemplates: 5,
    pendingTemplates: 2,
    accessibleTemplates: 5,
    lockedTemplates: 2,
    affectedGroups: 1,
    pendingLinks: 1,
    closedLinks: 1,
    lockedLinks: 1,
    affectedSigningRequests: 3,
    affectedSigningDrafts: 1,
    retainedSigningRequests: 2,
    completedSigningRequests: 1,
  },
  templates: [
    { id: 'tpl-1', name: 'Template One', createdAt: '2026-01-01T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-2', name: 'Template Two', createdAt: '2026-01-02T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-3', name: 'Template Three', createdAt: '2026-01-03T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-4', name: 'Template Four', createdAt: '2026-01-04T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-5', name: 'Template Five', createdAt: '2026-01-05T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-6', name: 'Template Six', createdAt: '2026-01-06T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
    { id: 'tpl-7', name: 'Template Seven', createdAt: '2026-01-07T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
  ],
  groups: [{ id: 'group-1', name: 'Admissions Packet', templateCount: 7, pendingTemplateCount: 2, willDelete: false, accessStatus: 'locked', locked: true, lockedTemplateIds: ['tpl-6', 'tpl-7'] }],
  links: [{ id: 'link-6', title: 'Template Six Link', scopeType: 'template', status: 'closed', templateId: 'tpl-6', pendingDeleteReason: 'template_pending_delete', accessStatus: 'locked', locked: true }],
};

const defaultLimits: ProfileLimits = {
  detectMaxPages: 10,
  fillableMaxPages: 20,
  savedFormsMax: 5,
  fillLinkResponsesMonthlyMax: 25,
  templateApiActiveMax: 1,
  templateApiRequestsMonthlyMax: 250,
  templateApiMaxPages: 25,
  signingRequestsMonthlyMax: 25,
};

const defaultSavedForms: SavedFormSummary[] = [
  { id: 'tpl-1', name: 'Template One', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'tpl-2', name: 'Template Two', createdAt: '2026-01-02T00:00:00Z' },
  { id: 'tpl-3', name: 'Template Three', createdAt: '2026-01-03T00:00:00Z' },
  { id: 'tpl-4', name: 'Template Four', createdAt: '2026-01-04T00:00:00Z' },
  { id: 'tpl-5', name: 'Template Five', createdAt: '2026-01-05T00:00:00Z' },
  { id: 'tpl-6', name: 'Template Six', createdAt: '2026-01-06T00:00:00Z', accessStatus: 'locked', locked: true },
  { id: 'tpl-7', name: 'Template Seven', createdAt: '2026-01-07T00:00:00Z', accessStatus: 'locked', locked: true },
];

const defaultProfile = {
  email: 'playwright@example.com',
  role: 'base',
  creditsRemaining: 10,
  monthlyCreditsRemaining: 0,
  refillCreditsRemaining: 0,
  availableCredits: 10,
  refillCreditsLocked: false,
};

type HarnessScenario = {
  retention: DowngradeRetentionSummary | null;
  limits: ProfileLimits;
  savedForms: SavedFormSummary[];
  profile: typeof defaultProfile;
  billingEnabled: boolean;
  dialogInitiallyOpen: boolean;
  options: NonNullable<HarnessWindow['__PW_RETENTION_OPTIONS__']>;
};

function recordEvent(event: HarnessEvent): void {
  harnessWindow.__PW_RETENTION_EVENTS__ = [...(harnessWindow.__PW_RETENTION_EVENTS__ || []), event];
}

function resolveHarnessRetention(targetWindow: HarnessWindow): DowngradeRetentionSummary | null {
  const hasExplicitRetention = Object.prototype.hasOwnProperty.call(targetWindow, '__PW_RETENTION_SUMMARY__');
  return hasExplicitRetention ? (targetWindow.__PW_RETENTION_SUMMARY__ ?? null) : defaultRetention;
}

// Snapshot injected window overrides once before React mounts so each smoke case stays deterministic.
function resolveHarnessScenario(targetWindow: HarnessWindow): HarnessScenario {
  const retention = resolveHarnessRetention(targetWindow);
  const options = targetWindow.__PW_RETENTION_OPTIONS__ || {};
  return {
    retention,
    limits: {
      ...defaultLimits,
      ...(targetWindow.__PW_RETENTION_LIMITS__ || {}),
    },
    savedForms: targetWindow.__PW_RETENTION_SAVED_FORMS__ || defaultSavedForms,
    profile: {
      ...defaultProfile,
      ...(targetWindow.__PW_RETENTION_PROFILE__ || {}),
    },
    billingEnabled: options.billingEnabled !== false,
    dialogInitiallyOpen: options.initiallyOpen !== false && retention !== null,
    options,
  };
}

function HarnessApp() {
  const scenario = useMemo(() => resolveHarnessScenario(harnessWindow), []);
  const { retention, limits, savedForms, profile, billingEnabled, dialogInitiallyOpen, options } = scenario;
  const [open, setOpen] = useState(dialogInitiallyOpen);

  return (
    <div style={{ padding: '24px', background: '#f4f7fb' }}>
      <ProfilePage
        email={profile.email}
        role={profile.role}
        creditsRemaining={profile.creditsRemaining}
        monthlyCreditsRemaining={profile.monthlyCreditsRemaining}
        refillCreditsRemaining={profile.refillCreditsRemaining}
        availableCredits={profile.availableCredits}
        refillCreditsLocked={profile.refillCreditsLocked === true}
        billingEnabled={billingEnabled}
        retention={retention}
        limits={limits}
        savedForms={savedForms}
        onSelectSavedForm={() => {}}
        onOpenDowngradeRetention={() => {
          recordEvent({ type: 'profile-open' });
          if (retention) {
            setOpen(true);
          }
        }}
        onClose={() => {}}
      />
      {retention ? (
        <DowngradeRetentionDialog
          open={open}
          retention={retention}
          billingEnabled={billingEnabled}
          savingSelection={options.savingSelection === true}
          checkoutInProgress={options.checkoutInProgress === true}
          reactivateLabel={options.reactivateLabel}
          onClose={() => {
            recordEvent({ type: 'close' });
            setOpen(false);
          }}
          onSaveSelection={(keptTemplateIds) => recordEvent({ type: 'save', keptTemplateIds })}
          onReactivatePremium={() => recordEvent({ type: 'reactivate' })}
        />
      ) : null}
    </div>
  );
}

harnessWindow.__PW_RETENTION_EVENTS__ = [];
document.body.innerHTML = '<div id="pw-downgrade-retention-root"></div>';
createRoot(document.getElementById('pw-downgrade-retention-root') as HTMLElement).render(<HarnessApp />);
