import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import DowngradeRetentionDialog from '../../../../src/components/features/DowngradeRetentionDialog';
import type { DowngradeRetentionSummary } from '../../../../src/services/api';

const retentionSummary: DowngradeRetentionSummary = {
  status: 'grace_period',
  policyVersion: 2,
  downgradedAt: '2026-03-01T00:00:00Z',
  graceEndsAt: null,
  daysRemaining: 0,
  savedFormsLimit: 3,
  keptTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3'],
  pendingDeleteTemplateIds: ['tpl-4'],
  pendingDeleteLinkIds: ['link-4'],
  accessibleTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3'],
  lockedTemplateIds: ['tpl-4'],
  lockedLinkIds: ['link-4'],
  selectionMode: 'oldest_created',
  manualSelectionAllowed: false,
  counts: {
    keptTemplates: 3,
    pendingTemplates: 1,
    affectedGroups: 1,
    pendingLinks: 1,
    closedLinks: 1,
    affectedSigningRequests: 3,
    affectedSigningDrafts: 1,
    retainedSigningRequests: 2,
    completedSigningRequests: 1,
  },
  templates: [
    { id: 'tpl-1', name: 'Template One', createdAt: '2026-01-01T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-2', name: 'Template Two', createdAt: '2026-01-02T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-3', name: 'Template Three', createdAt: '2026-01-03T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-4', name: 'Template Four', createdAt: '2026-01-04T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
  ],
  groups: [
    {
      id: 'group-1',
      name: 'Admissions Packet',
      templateCount: 4,
      pendingTemplateCount: 1,
      willDelete: false,
      accessStatus: 'locked',
      locked: true,
      lockedTemplateIds: ['tpl-4'],
    },
  ],
  links: [
    {
      id: 'link-4',
      title: 'Template Four Link',
      scopeType: 'template',
      status: 'closed',
      templateId: 'tpl-4',
      pendingDeleteReason: 'template_pending_delete',
      accessStatus: 'locked',
      locked: true,
    },
  ],
};

describe('DowngradeRetentionDialog', () => {
  it('renders locked-access metadata and the upgrade action', () => {
    render(
      <DowngradeRetentionDialog
        open
        retention={retentionSummary}
        billingEnabled
        onClose={vi.fn()}
        onSaveSelection={vi.fn()}
        onReactivatePremium={vi.fn()}
      />,
    );

    expect(screen.getByText('Base plan template access')).toBeTruthy();
    expect(screen.getAllByText('Accessible').length).toBeGreaterThan(1);
    expect(screen.getByText('Locked templates')).toBeTruthy();
    expect(screen.getByText(/stay stored but locked until you upgrade/i)).toBeTruthy();
    expect(screen.getByText(/manual swapping is not available/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save kept forms' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Reactivate Pro Monthly' })).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
  });

  it('wires the reactivate action', async () => {
    const user = userEvent.setup();
    const onReactivatePremium = vi.fn();

    render(
      <DowngradeRetentionDialog
        open
        retention={retentionSummary}
        billingEnabled
        onClose={vi.fn()}
        onSaveSelection={vi.fn()}
        onReactivatePremium={onReactivatePremium}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Reactivate Pro Monthly' }));
    expect(onReactivatePremium).toHaveBeenCalledTimes(1);
  });

  it('disables reactivation when billing is unavailable', () => {
    render(
      <DowngradeRetentionDialog
        open
        retention={retentionSummary}
        billingEnabled={false}
        onClose={vi.fn()}
        onSaveSelection={vi.fn()}
        onReactivatePremium={vi.fn()}
      />,
    );

    expect((screen.getByRole('button', { name: 'Reactivate Pro Monthly' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Stripe billing is currently unavailable, so reactivation is temporarily disabled.')).toBeTruthy();
  });

  it('still supports the legacy manual-selection branch when explicitly enabled', async () => {
    const user = userEvent.setup();
    const onSaveSelection = vi.fn();
    const manualSelectionRetention: DowngradeRetentionSummary = {
      ...retentionSummary,
      manualSelectionAllowed: true,
    };

    render(
      <DowngradeRetentionDialog
        open
        retention={manualSelectionRetention}
        billingEnabled
        onClose={vi.fn()}
        onSaveSelection={onSaveSelection}
        onReactivatePremium={vi.fn()}
      />,
    );

    const saveButton = screen.getByRole('button', { name: 'Save kept forms' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    await user.click(checkboxes[2]);
    await user.click(checkboxes[3]);

    expect(saveButton.disabled).toBe(false);
    await user.click(saveButton);
    expect(onSaveSelection).toHaveBeenCalledWith(['tpl-1', 'tpl-2', 'tpl-4']);
  });
});
