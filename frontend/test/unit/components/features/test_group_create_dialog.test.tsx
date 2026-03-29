import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { GroupCreateDialog } from '../../../../src/components/features/GroupCreateDialog';

describe('GroupCreateDialog', () => {
  it('preserves the typed group name across rerenders with equivalent initial selections', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();
    const savedForms = [
      { id: 'form-1', name: 'Alpha Intake', createdAt: '2026-03-10T12:00:00.000Z' },
      { id: 'form-2', name: 'Beta Intake', createdAt: '2026-03-10T12:00:00.000Z' },
    ];

    const { rerender } = render(
      <GroupCreateDialog
        open
        savedForms={savedForms}
        initialSelectedIds={[]}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    const nameInput = screen.getByPlaceholderText('New hire packet');
    await user.type(nameInput, 'Hiring Packet');

    rerender(
      <GroupCreateDialog
        open
        savedForms={[...savedForms]}
        initialSelectedIds={[]}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(
      (screen.getByPlaceholderText('New hire packet') as HTMLInputElement).value,
    ).toBe('Hiring Packet');
  });

  it('surfaces submit failures inside the dialog instead of failing silently', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(new Error('Group service unavailable.'));

    render(
      <GroupCreateDialog
        open
        savedForms={[
          { id: 'form-1', name: 'Alpha Intake', createdAt: '2026-03-10T12:00:00.000Z' },
        ]}
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    await user.type(screen.getByPlaceholderText('New hire packet'), 'Hiring Packet');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Create group' }));

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Hiring Packet',
      templateIds: ['form-1'],
    });
    expect(await screen.findByText('Group service unavailable.')).toBeTruthy();
  });

  it('renders locked saved forms as disabled options after accessible templates', () => {
    render(
      <GroupCreateDialog
        open
        savedForms={[
          { id: 'form-locked', name: 'Locked Packet', createdAt: '2026-03-10T12:00:00.000Z', accessStatus: 'locked', locked: true },
          { id: 'form-open', name: 'Alpha Intake', createdAt: '2026-03-10T12:00:00.000Z' },
        ]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes).toHaveLength(2);
    expect(screen.getByText('Locked Packet (Locked on base)')).toBeTruthy();
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[0].disabled).toBe(false);
    expect(checkboxes[1].checked).toBe(false);
    expect(checkboxes[1].disabled).toBe(true);
  });
});
