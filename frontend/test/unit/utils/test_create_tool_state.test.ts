import { describe, expect, it } from 'vitest';

import type { PdfField, RadioToolDraft } from '../../../src/types';
import {
  prunePendingQuickRadioSelection,
  resolvePendingQuickRadioFields,
  resolveRadioToolDraftForToolChange,
} from '../../../src/utils/createToolState';

function makeField(overrides: Partial<PdfField> & Pick<PdfField, 'id' | 'name' | 'type' | 'page'>): PdfField {
  return {
    id: overrides.id,
    name: overrides.name,
    type: overrides.type,
    page: overrides.page,
    rect: { x: 10, y: 10, width: 14, height: 14 },
    ...overrides,
  };
}

function makeDraft(partial: Partial<RadioToolDraft> = {}): RadioToolDraft {
  return {
    groupId: partial.groupId ?? 'group-1',
    groupKey: partial.groupKey ?? 'group_1',
    groupLabel: partial.groupLabel ?? 'Group 1',
    nextOptionKey: partial.nextOptionKey ?? 'option_1',
    nextOptionLabel: partial.nextOptionLabel ?? 'Option 1',
  };
}

describe('createToolState utils', () => {
  it('starts a fresh radio draft when returning to radio after another tool', () => {
    const previousDraft = makeDraft({ groupId: 'old-group', groupKey: 'old_group', groupLabel: 'Old Group' });
    const nextDraft = resolveRadioToolDraftForToolChange(
      'radio',
      'radio',
      'checkbox',
      previousDraft,
      [makeField({ id: 'field-1', name: 'field-1', type: 'text', page: 1 })],
    );

    expect(nextDraft).not.toBeNull();
    expect(nextDraft?.groupId).not.toBe(previousDraft.groupId);
    expect(nextDraft?.groupLabel).not.toBe(previousDraft.groupLabel);
  });

  it('preserves the active draft while staying on the same radio tool', () => {
    const currentDraft = makeDraft({ groupId: 'active-group', groupKey: 'active_group', groupLabel: 'Active Group' });

    expect(
      resolveRadioToolDraftForToolChange('radio', 'radio', 'radio', currentDraft, []),
    ).toBe(currentDraft);
    expect(
      resolveRadioToolDraftForToolChange('quick-radio', 'quick-radio', 'quick-radio', currentDraft, []),
    ).toBe(currentDraft);
  });

  it('drops pending quick-radio selections when the active page changes', () => {
    const selection = { fieldIds: ['field-1'], page: 1 };

    expect(
      prunePendingQuickRadioSelection(selection, [makeField({ id: 'field-1', name: 'field-1', type: 'checkbox', page: 1 })], 2),
    ).toBeNull();
  });

  it('keeps only checkbox ids that still exist on the selection page', () => {
    const selection = { fieldIds: ['keep', 'remove-type', 'remove-page', 'missing'], page: 1 };
    const fields = [
      makeField({ id: 'keep', name: 'keep', type: 'checkbox', page: 1 }),
      makeField({ id: 'remove-type', name: 'remove-type', type: 'radio', page: 1 }),
      makeField({ id: 'remove-page', name: 'remove-page', type: 'checkbox', page: 2 }),
    ];

    expect(prunePendingQuickRadioSelection(selection, fields, 1)).toEqual({
      fieldIds: ['keep'],
      page: 1,
    });
  });

  it('returns pending quick-radio fields in the stored selection order', () => {
    const selection = { fieldIds: ['second', 'first'], page: 1 };
    const fields = [
      makeField({ id: 'first', name: 'first', type: 'checkbox', page: 1, rect: { x: 10, y: 10, width: 14, height: 14 } }),
      makeField({ id: 'second', name: 'second', type: 'checkbox', page: 1, rect: { x: 40, y: 10, width: 14, height: 14 } }),
    ];

    expect(resolvePendingQuickRadioFields(selection, fields).map((field) => field.id)).toEqual(['second', 'first']);
  });
});
