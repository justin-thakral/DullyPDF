import { describe, expect, it } from 'vitest';

import type { CheckboxRule, PdfField } from '../../../src/types';
import { buildFillLinkQuestionsFromFields } from '../../../src/utils/fillLinkWebForm';

function makeField(overrides: Partial<PdfField>): PdfField {
  return {
    id: overrides.id || 'field-1',
    name: overrides.name || 'field_1',
    type: overrides.type || 'text',
    page: overrides.page || 1,
    rect: overrides.rect || { x: 10, y: 10, width: 40, height: 14 },
    ...overrides,
  };
}

describe('fillLinkWebForm utils', () => {
  it('excludes signature widgets from generated Fill By Link questions', () => {
    const questions = buildFillLinkQuestionsFromFields([
      makeField({ id: 'signature', name: 'Signature', type: 'signature' }),
      makeField({ id: 'email', name: 'email', type: 'text', rect: { x: 10, y: 40, width: 120, height: 14 } }),
    ]);

    expect(questions.some((question) => question.sourceField === 'Signature')).toBe(false);
    expect(questions.some((question) => question.key === 'email')).toBe(true);
    expect(questions.some((question) => question.requiredForRespondentIdentity)).toBe(true);
  });

  it('groups explicit radio widgets into one single-choice web-form question', () => {
    const questions = buildFillLinkQuestionsFromFields([
      makeField({
        id: 'radio-email',
        name: 'preferred_contact_email',
        type: 'radio',
        radioGroupId: 'preferred-contact',
        radioGroupKey: 'preferred_contact',
        radioGroupLabel: 'Preferred Contact',
        radioOptionKey: 'email',
        radioOptionLabel: 'Email',
        rect: { x: 10, y: 10, width: 14, height: 14 },
      }),
      makeField({
        id: 'radio-sms',
        name: 'preferred_contact_sms',
        type: 'radio',
        radioGroupId: 'preferred-contact',
        radioGroupKey: 'preferred_contact',
        radioGroupLabel: 'Preferred Contact',
        radioOptionKey: 'sms',
        radioOptionLabel: 'SMS',
        rect: { x: 50, y: 10, width: 14, height: 14 },
      }),
    ]);

    const preferredContact = questions.find((question) => question.sourceType === 'radio_group');
    expect(preferredContact).toMatchObject({
      key: 'preferred_contact',
      label: 'Preferred Contact',
      type: 'radio',
      sourceType: 'radio_group',
    });
    expect(preferredContact?.options).toEqual([
      { key: 'email', label: 'Email' },
      { key: 'sms', label: 'SMS' },
    ]);
  });

  it('uses the radio option key when the stored option label collapsed back to the field text', () => {
    const questions = buildFillLinkQuestionsFromFields([
      makeField({
        id: 'single',
        name: 'Marital Status: Single Married Divorced Separat…',
        type: 'radio',
        radioGroupId: 'marital-status',
        radioGroupKey: 'marital_status',
        radioGroupLabel: 'Marital Status',
        radioOptionKey: 'single',
        radioOptionLabel: 'Marital Status: Single Married Divorced Separat…',
        rect: { x: 10, y: 10, width: 14, height: 14 },
      }),
      makeField({
        id: 'married',
        name: 'Marital Status: Single Married Divorced Separat…',
        type: 'radio',
        radioGroupId: 'marital-status',
        radioGroupKey: 'marital_status',
        radioGroupLabel: 'Marital Status',
        radioOptionKey: 'married',
        radioOptionLabel: 'Marital Status: Single Married Divorced Separat…',
        rect: { x: 50, y: 10, width: 14, height: 14 },
      }),
    ]);

    const maritalStatus = questions.find((question) => question.key === 'marital_status');
    expect(maritalStatus?.options).toEqual([
      { key: 'single', label: 'Single' },
      { key: 'married', label: 'Married' },
    ]);
  });

  it('keeps unresolved checkbox groups as checkbox-style questions until they are converted to radios', () => {
    const checkboxRules: CheckboxRule[] = [
      {
        databaseField: 'marital_status',
        groupKey: 'marital_status',
        operation: 'enum',
      },
    ];
    const questions = buildFillLinkQuestionsFromFields(
      [
        makeField({
          id: 'single',
          name: 'i_marital_status_single',
          type: 'checkbox',
          groupKey: 'marital_status',
          groupLabel: 'Marital Status',
          optionKey: 'single',
          optionLabel: 'Single',
          rect: { x: 10, y: 10, width: 14, height: 14 },
        }),
        makeField({
          id: 'married',
          name: 'i_marital_status_married',
          type: 'checkbox',
          groupKey: 'marital_status',
          groupLabel: 'Marital Status',
          optionKey: 'married',
          optionLabel: 'Married',
          rect: { x: 40, y: 10, width: 14, height: 14 },
        }),
      ],
      checkboxRules,
    );

    const maritalStatus = questions.find((question) => question.key === 'marital_status');
    expect(maritalStatus).toMatchObject({
      key: 'marital_status',
      label: 'Marital Status',
      type: 'multi_select',
      sourceType: 'checkbox_group',
    });
    expect(maritalStatus?.options).toEqual([
      { key: 'single', label: 'Single' },
      { key: 'married', label: 'Married' },
    ]);
  });
});
