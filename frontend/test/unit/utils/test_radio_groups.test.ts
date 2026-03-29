import { describe, expect, it } from 'vitest';

import type { PdfField } from '../../../src/types';
import {
  buildNextRadioToolDraft,
  buildRadioGroups,
  convertFieldsToRadioGroup,
  createRadioFieldFromRect,
  renameRadioGroup,
  resolveRadioOptionDisplayLabel,
  setRadioGroupSelectedValue,
} from '../../../src/utils/radioGroups';

function makeCheckbox(id: string, name: string, x: number): PdfField {
  return {
    id,
    name,
    type: 'checkbox',
    page: 1,
    rect: { x, y: 10, width: 14, height: 14 },
  };
}

describe('radioGroups utils', () => {
  it('converts checkbox selections into an ordered radio group', () => {
    const fields = [
      makeCheckbox('field-1', 'single', 10),
      makeCheckbox('field-2', 'married', 40),
    ];
    const draft = buildNextRadioToolDraft(fields, 'Marital Status');

    const converted = convertFieldsToRadioGroup(fields, ['field-1', 'field-2'], draft);
    const radioFields = converted.filter((field) => field.type === 'radio');

    expect(radioFields).toHaveLength(2);
    expect(radioFields[0].radioGroupLabel).toBe('Marital Status');
    expect(radioFields[0].radioOptionOrder).toBe(1);

    const groups = buildRadioGroups(converted);
    expect(groups).toEqual([
      expect.objectContaining({
        label: 'Marital Status',
        key: 'marital_status',
        options: [
          expect.objectContaining({ fieldId: 'field-1' }),
          expect.objectContaining({ fieldId: 'field-2' }),
        ],
      }),
    ]);
  });

  it('creates new radio widgets with square geometry and unique option keys', () => {
    const draft = buildNextRadioToolDraft([], 'Coverage');
    const first = createRadioFieldFromRect([], 1, { width: 200, height: 200 }, {
      x: 10,
      y: 10,
      width: 18,
      height: 12,
    }, draft);
    const second = createRadioFieldFromRect([first], 1, { width: 200, height: 200 }, {
      x: 40,
      y: 10,
      width: 14,
      height: 14,
    }, draft);

    expect(first.type).toBe('radio');
    expect(first.rect.width).toBe(first.rect.height);
    expect(second.radioOptionKey).not.toBe(first.radioOptionKey);
  });

  it('falls back to a normalized group key when the radio tool draft key is blank', () => {
    const first = createRadioFieldFromRect([], 1, { width: 200, height: 200 }, {
      x: 10,
      y: 10,
      width: 18,
      height: 18,
    }, {
      groupId: 'group-1',
      groupKey: '',
      groupLabel: 'Preferred Contact',
      nextOptionKey: 'option_1',
      nextOptionLabel: 'Email',
    });

    expect(first.radioGroupKey).toBe('preferred_contact');
    expect(first.name).toContain('preferred_contact');
  });

  it('starts a fresh conversion draft instead of appending into an unrelated radio group', () => {
    const manualDraft = buildNextRadioToolDraft([], 'Household Status');
    const firstManual = createRadioFieldFromRect([], 1, { width: 200, height: 200 }, {
      x: 10,
      y: 10,
      width: 14,
      height: 14,
    }, manualDraft);
    const secondManual = createRadioFieldFromRect([firstManual], 1, { width: 200, height: 200 }, {
      x: 40,
      y: 10,
      width: 14,
      height: 14,
    }, manualDraft);
    const existingFields = [firstManual, secondManual];

    const quickDraft = buildNextRadioToolDraft(existingFields);
    const converted = convertFieldsToRadioGroup(
      [
        ...existingFields,
        makeCheckbox('field-3', 'yes', 10),
        makeCheckbox('field-4', 'no', 40),
      ],
      ['field-3', 'field-4'],
      quickDraft,
    );
    const quickFields = converted.filter((field) => field.id === 'field-3' || field.id === 'field-4');

    expect(quickDraft.groupId).not.toBe(manualDraft.groupId);
    expect(quickFields.map((field) => field.radioGroupId)).toEqual([quickDraft.groupId, quickDraft.groupId]);
    expect(quickFields.map((field) => field.radioOptionKey)).toEqual(['option_1', 'option_2']);
    expect(quickFields.map((field) => field.radioOptionOrder)).toEqual([1, 2]);
  });

  it('normalizes converted radio widgets to square geometry and clamps them to the page', () => {
    const draft = buildNextRadioToolDraft([], 'Choice');
    const converted = convertFieldsToRadioGroup(
      [
        {
          id: 'field-1',
          name: 'field-1',
          type: 'checkbox',
          page: 1,
          rect: { x: 190, y: 10, width: 8, height: 18 },
        },
      ],
      ['field-1'],
      draft,
      { 1: { width: 200, height: 200 } },
    );

    expect(converted[0]).toEqual(expect.objectContaining({
      type: 'radio',
      rect: { x: 182, y: 10, width: 18, height: 18 },
    }));
  });

  it('assigns quick-radio option order by page position instead of source array order', () => {
    const draft = buildNextRadioToolDraft([], 'Pets');
    const converted = convertFieldsToRadioGroup(
      [
        makeCheckbox('dog', 'dog', 80),
        makeCheckbox('cat', 'cat', 10),
        makeCheckbox('bird', 'bird', 45),
      ],
      ['dog', 'cat', 'bird'],
      draft,
      { 1: { width: 200, height: 200 } },
    );

    const byId = new Map(converted.map((field) => [field.id, field]));
    expect(byId.get('cat')?.radioOptionOrder).toBe(1);
    expect(byId.get('bird')?.radioOptionOrder).toBe(2);
    expect(byId.get('dog')?.radioOptionOrder).toBe(3);
  });

  it('falls back to a normalized quick-radio group key when the draft key is blank', () => {
    const draft = {
      groupId: 'group-1',
      groupKey: '',
      groupLabel: 'Residence Type',
      nextOptionKey: 'option_1',
      nextOptionLabel: 'Option 1',
    };
    const converted = convertFieldsToRadioGroup(
      [makeCheckbox('own', 'own', 10), makeCheckbox('rent', 'rent', 40)],
      ['own', 'rent'],
      draft,
      { 1: { width: 200, height: 200 } },
    );

    expect(converted[0].radioGroupKey).toBe('residence_type');
    expect(converted[1].radioGroupKey).toBe('residence_type');
  });

  it('suffixes a renamed radio group key when another group already uses it', () => {
    const primaryDraft = buildNextRadioToolDraft([], 'Primary Status');
    const primaryFields = convertFieldsToRadioGroup(
      [makeCheckbox('own', 'own', 10), makeCheckbox('rent', 'rent', 40)],
      ['own', 'rent'],
      primaryDraft,
      { 1: { width: 200, height: 200 } },
    );
    const secondaryDraft = buildNextRadioToolDraft(primaryFields, 'Secondary Status');
    const withSecondGroup = convertFieldsToRadioGroup(
      [...primaryFields, makeCheckbox('yes', 'yes', 70), makeCheckbox('no', 'no', 100)],
      ['yes', 'no'],
      secondaryDraft,
      { 1: { width: 200, height: 200 } },
    );

    const renamed = renameRadioGroup(withSecondGroup, secondaryDraft.groupId, {
      key: primaryDraft.groupKey,
      label: 'Renamed Status',
    });

    const secondGroupFields = renamed.filter((field) => field.radioGroupId === secondaryDraft.groupId);
    expect(secondGroupFields.map((field) => field.radioGroupKey)).toEqual(['primary_status_2', 'primary_status_2']);
    expect(secondGroupFields.map((field) => field.radioGroupLabel)).toEqual(['Renamed Status', 'Renamed Status']);
  });

  it('keeps only one selected value inside a radio group', () => {
    const fields = convertFieldsToRadioGroup(
      [makeCheckbox('field-1', 'yes', 10), makeCheckbox('field-2', 'no', 40)],
      ['field-1', 'field-2'],
      buildNextRadioToolDraft([], 'Over 18'),
    );

    const selected = setRadioGroupSelectedValue(fields, 'field-2');

    expect(selected.find((field) => field.id === 'field-1')?.value).toBeNull();
    expect(selected.find((field) => field.id === 'field-2')?.value).toBe(
      selected.find((field) => field.id === 'field-2')?.radioOptionKey,
    );
  });

  it('prefers a specific radio option key over a collapsed field label when deriving display text', () => {
    expect(resolveRadioOptionDisplayLabel({
      name: 'Sex: M F',
      radioGroupLabel: 'Patient Sex',
      radioOptionKey: 'female',
      radioOptionLabel: 'Sex: M F',
    })).toBe('Female');
  });
});
