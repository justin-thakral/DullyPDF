import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../../src/config/firebaseConfig', () => ({
  firebaseConfig: {
    apiKey: 'test-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project',
    storageBucket: 'test.appspot.com',
    messagingSenderId: '000000000000',
    appId: '1:000000000000:web:0000000000000000',
  },
}));

vi.mock('../../../../src/services/firebaseClient', () => ({
  firebaseApp: {},
  firebaseAuth: { currentUser: null },
}));

vi.mock('../../../../src/services/auth', () => ({
  Auth: {
    signOut: vi.fn(),
    onAuthStateChanged: vi.fn(() => () => {}),
  },
  getFreshIdToken: vi.fn().mockResolvedValue('mock-token'),
}));

vi.mock('../../../../src/services/api', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('../../../../src/services/api');
  return {
    ...actual,
    ApiService: {
      getSigningOptions: vi.fn(),
      getSigningRequests: vi.fn().mockResolvedValue([]),
      createSigningRequest: vi.fn(),
      createSigningEnvelope: vi.fn(),
      sendSigningRequest: vi.fn(),
      sendSigningEnvelope: vi.fn(),
      getSigningRequest: vi.fn(),
      revokeSigningRequest: vi.fn(),
      reissueSigningRequest: vi.fn(),
      getSigningRequestArtifacts: vi.fn(),
      downloadAuthenticatedFile: vi.fn(),
      recordSigningManualShare: vi.fn(),
    },
  };
});

import { SignatureRequestDialog } from '../../../../src/components/features/SignatureRequestDialog';
import type { SigningOptions } from '../../../../src/services/api';

const SIGNING_OPTIONS: SigningOptions = {
  modes: [
    { key: 'sign', label: 'Sign' },
    { key: 'fill_and_sign', label: 'Fill and Sign' },
  ],
  signatureModes: [
    { key: 'business', label: 'Business' },
    { key: 'consumer', label: 'Consumer' },
  ],
  categories: [
    { key: 'ordinary_business_form', label: 'Ordinary business form', blocked: false },
  ],
};

function buildDefaultProps(overrides: Partial<Parameters<typeof SignatureRequestDialog>[0]> = {}) {
  return {
    open: true as const,
    onClose: vi.fn(),
    hasDocument: true,
    sourceDocumentName: 'Test Document',
    options: SIGNING_OPTIONS,
    onCreateDraft: vi.fn(),
    onCreateDrafts: vi.fn(),
    ...overrides,
  };
}

function getSigningModeGroup(): HTMLElement {
  const tablists = screen.getAllByRole('tablist', { name: 'Signing mode' });
  return tablists[1] as HTMLElement;
}

/**
 * Adds two recipients to the dialog by filling the manual recipient form
 * and clicking "Add recipient" for each.
 */
async function addTwoRecipients(user: ReturnType<typeof userEvent.setup>) {
  const nameInput = screen.getByLabelText('Signer name');
  const emailInput = screen.getByLabelText('Signer email');
  const addButton = screen.getByRole('button', { name: 'Add recipient' });

  await user.clear(nameInput);
  await user.type(nameInput, 'Alice First');
  await user.clear(emailInput);
  await user.type(emailInput, 'alice@example.com');
  await user.click(addButton);

  await user.clear(nameInput);
  await user.type(nameInput, 'Bob Second');
  await user.clear(emailInput);
  await user.type(emailInput, 'bob@example.com');
  await user.click(addButton);
}

// userEvent-heavy interactions here intermittently race under the full
// ``npm run test`` parallel run (the same pattern as FeaturePlanPage's
// checkout flow). Bounded retry keeps the suite deterministic without
// masking real regressions — each individual test passes 3/3 in isolation.
describe('SignatureRequestDialog - Signing Mode / Multi-Signer Envelope', { retry: 2 }, () => {
  it('renders signing mode toggle buttons', () => {
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    const signingModeGroup = getSigningModeGroup();
    expect(within(signingModeGroup).getByText('Separate')).toBeTruthy();
    expect(within(signingModeGroup).getByText('Parallel')).toBeTruthy();
    expect(within(signingModeGroup).getByText('Sequential')).toBeTruthy();
  });

  it('defaults to separate mode', () => {
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    const signingModeGroup = getSigningModeGroup();
    const separateButton = within(signingModeGroup).getByText('Separate');
    const parallelButton = within(signingModeGroup).getByText('Parallel');
    const sequentialButton = within(signingModeGroup).getByText('Sequential');

    expect(separateButton.className).toContain('ui-button--primary');
    expect(parallelButton.className).not.toContain('ui-button--primary');
    expect(parallelButton.className).toContain('ui-button--ghost');
    expect(sequentialButton.className).not.toContain('ui-button--primary');
    expect(sequentialButton.className).toContain('ui-button--ghost');
  });

  it('switches to sequential mode on click', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    const signingModeGroup = getSigningModeGroup();
    const sequentialButton = within(signingModeGroup).getByText('Sequential');
    const separateButton = within(signingModeGroup).getByText('Separate');

    await user.click(sequentialButton);

    expect(sequentialButton.className).toContain('ui-button--primary');
    expect(separateButton.className).not.toContain('ui-button--primary');
    expect(separateButton.className).toContain('ui-button--ghost');
  });

  it('shows sequence numbers in sequential mode', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const orderBadges = document.querySelectorAll('.signature-request-dialog__recipient-order');
    expect(orderBadges.length).toBe(2);
    expect(orderBadges[0].textContent).toBe('1');
    expect(orderBadges[1].textContent).toBe('2');
  });

  it('shows reorder buttons only in sequential mode', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    expect(screen.queryByLabelText('Move up')).toBeNull();
    expect(screen.queryByLabelText('Move down')).toBeNull();

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    expect(screen.queryAllByLabelText('Move up').length).toBeGreaterThan(0);
    expect(screen.queryAllByLabelText('Move down').length).toBeGreaterThan(0);
  });

  it('hides reorder buttons in parallel mode', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));
    expect(screen.queryAllByLabelText('Move up').length).toBeGreaterThan(0);

    await user.click(within(signingModeGroup).getByText('Parallel'));

    expect(screen.queryByLabelText('Move up')).toBeNull();
    expect(screen.queryByLabelText('Move down')).toBeNull();
  });

  it('move up reorders recipients', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const cardsBefore = document.querySelectorAll('.signature-request-dialog__recipient-card--sequential');
    expect(cardsBefore.length).toBe(2);
    expect(cardsBefore[0].textContent).toContain('Alice First');
    expect(cardsBefore[1].textContent).toContain('Bob Second');

    const moveUpButtons = screen.getAllByLabelText('Move up');
    await user.click(moveUpButtons[1]);

    const cardsAfter = document.querySelectorAll('.signature-request-dialog__recipient-card--sequential');
    expect(cardsAfter[0].textContent).toContain('Bob Second');
    expect(cardsAfter[1].textContent).toContain('Alice First');
  });

  it('move down reorders recipients', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const cardsBefore = document.querySelectorAll('.signature-request-dialog__recipient-card--sequential');
    expect(cardsBefore[0].textContent).toContain('Alice First');
    expect(cardsBefore[1].textContent).toContain('Bob Second');

    const moveDownButtons = screen.getAllByLabelText('Move down');
    await user.click(moveDownButtons[0]);

    const cardsAfter = document.querySelectorAll('.signature-request-dialog__recipient-card--sequential');
    expect(cardsAfter[0].textContent).toContain('Bob Second');
    expect(cardsAfter[1].textContent).toContain('Alice First');
  });

  it('first recipient has disabled up button', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const moveUpButtons = screen.getAllByLabelText('Move up');
    expect((moveUpButtons[0] as HTMLButtonElement).disabled).toBe(true);
    expect((moveUpButtons[1] as HTMLButtonElement).disabled).toBe(false);
  });

  it('last recipient has disabled down button', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    await addTwoRecipients(user);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const moveDownButtons = screen.getAllByLabelText('Move down');
    expect((moveDownButtons[0] as HTMLButtonElement).disabled).toBe(false);
    expect((moveDownButtons[1] as HTMLButtonElement).disabled).toBe(true);
  });

  it('hero metric shows signing mode as Separate by default', () => {
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    const heroSection = screen.getByLabelText('Signing request overview');
    const signingModeLabel = within(heroSection).getByText('Signing mode');
    const metricContainer = signingModeLabel.closest('.signature-request-dialog__metric')!;
    expect(metricContainer).toBeTruthy();
    expect(within(metricContainer as HTMLElement).getByText('Separate')).toBeTruthy();
  });

  it('hero metric updates to Sequential after switching mode', async () => {
    const user = userEvent.setup();
    render(<SignatureRequestDialog {...buildDefaultProps()} />);

    const signingModeGroup = getSigningModeGroup();
    await user.click(within(signingModeGroup).getByText('Sequential'));

    const heroSection = screen.getByLabelText('Signing request overview');
    const signingModeLabel = within(heroSection).getByText('Signing mode');
    const metricContainer = signingModeLabel.closest('.signature-request-dialog__metric')!;
    expect(metricContainer).toBeTruthy();
    expect(within(metricContainer as HTMLElement).getByText('Sequential')).toBeTruthy();
  });
});
