import { describe, expect, it } from 'vitest';

import type { PdfField, RadioGroupSuggestion } from '../../../src/types';
import {
  applyRadioGroupSuggestions,
  applyRadioGroupSuggestion,
  buildRadioSuggestionFieldMap,
  isLegacyRadioGroupSuggestion,
  isRadioGroupSuggestionApplied,
  radioGroupSuggestionConfidenceTier,
  resolveRadioGroupSuggestionTargets,
  shouldAutoApplyRadioGroupSuggestion,
} from '../../../src/utils/radioGroupSuggestions';

function makeCheckbox(id: string, name: string, x: number): PdfField {
  return {
    id,
    name,
    type: 'checkbox',
    page: 1,
    rect: { x, y: 10, width: 14, height: 14 },
    value: null,
  };
}

const SUGGESTION: RadioGroupSuggestion = {
  id: 'marital-status',
  suggestedType: 'radio_group',
  groupKey: 'marital_status',
  groupLabel: 'Marital Status',
  sourceField: 'marital_status_value',
  suggestedFields: [
    { fieldId: 'single', fieldName: 'status_single', optionKey: 'single', optionLabel: 'Single' },
    { fieldId: 'married', fieldName: 'status_married', optionKey: 'married', optionLabel: 'Married' },
  ],
  selectionReason: 'enum',
};

describe('radioGroupSuggestions', () => {
  it('resolves suggestion targets by field id and field name', () => {
    const targets = resolveRadioGroupSuggestionTargets(
      [
        makeCheckbox('single', 'status_single', 10),
        makeCheckbox('married', 'status_married', 40),
      ],
      SUGGESTION,
    );

    expect(targets.map((entry) => entry.field.id)).toEqual(['single', 'married']);
    expect(targets.map((entry) => entry.optionKey)).toEqual(['single', 'married']);
  });

  it('applies a suggestion as an ai_suggestion radio group', () => {
    const nextFields = applyRadioGroupSuggestion(
      [
        makeCheckbox('single', 'status_single', 10),
        makeCheckbox('married', 'status_married', 40),
      ],
      SUGGESTION,
    );

    expect(nextFields.map((field) => field.type)).toEqual(['radio', 'radio']);
    expect(nextFields[0].radioGroupId).toBe('marital-status');
    expect(nextFields[0].radioGroupKey).toBe('marital_status_value');
    expect(nextFields[0].radioGroupSource).toBe('ai_suggestion');
    expect(nextFields[1].radioOptionKey).toBe('married');
    expect(isRadioGroupSuggestionApplied(nextFields, SUGGESTION)).toBe(true);
  });

  it('derives the radio option label from the option key when the field name is a collapsed group summary', () => {
    const targets = resolveRadioGroupSuggestionTargets(
      [
        makeCheckbox('single', 'Marital Status: Single Married Divorced Separat…', 10),
        makeCheckbox('married', 'Marital Status: Single Married Divorced Separat…', 40),
      ],
      {
        ...SUGGESTION,
        suggestedFields: [
          { fieldId: 'single', fieldName: 'status_single', optionKey: 'single', optionLabel: '' },
          { fieldId: 'married', fieldName: 'status_married', optionKey: 'married', optionLabel: '' },
        ],
      },
    );

    expect(targets.map((entry) => entry.optionLabel)).toEqual(['Single', 'Married']);
  });

  it('suffixes the persisted radio group key when another group already uses it', () => {
    const nextFields = applyRadioGroupSuggestion(
      [
        {
          id: 'existing-1',
          name: 'consent_yes',
          type: 'radio',
          page: 1,
          rect: { x: 10, y: 40, width: 14, height: 14 },
          radioGroupId: 'existing-group',
          radioGroupKey: 'marital_status_value',
          radioGroupLabel: 'Existing Group',
          radioOptionKey: 'yes',
          radioOptionLabel: 'Yes',
        },
        makeCheckbox('single', 'status_single', 10),
        makeCheckbox('married', 'status_married', 40),
      ],
      SUGGESTION,
    );

    expect(nextFields.find((field) => field.id === 'single')?.radioGroupKey).toBe('marital_status_value_2');
    expect(nextFields.find((field) => field.id === 'married')?.radioGroupKey).toBe('marital_status_value_2');
    expect(isRadioGroupSuggestionApplied(nextFields, SUGGESTION)).toBe(true);
  });

  it('builds a field lookup keyed by the highest-confidence suggestion', () => {
    const fields = [
      makeCheckbox('single', 'status_single', 10),
      makeCheckbox('married', 'status_married', 40),
    ];
    const weaker: RadioGroupSuggestion = {
      ...SUGGESTION,
      id: 'weaker',
      confidence: 0.2,
    };
    const stronger: RadioGroupSuggestion = {
      ...SUGGESTION,
      id: 'stronger',
      confidence: 0.9,
    };

    const lookup = buildRadioSuggestionFieldMap(fields, [weaker, stronger]);

    expect(lookup.get('single')?.id).toBe('stronger');
    expect(lookup.get('married')?.id).toBe('stronger');
  });

  it('applies multiple radio suggestions in sequence', () => {
    const secondSuggestion: RadioGroupSuggestion = {
      id: 'coverage-level',
      suggestedType: 'radio_group',
      groupKey: 'coverage_level',
      groupLabel: 'Coverage Level',
      suggestedFields: [
        { fieldId: 'basic', fieldName: 'coverage_basic', optionKey: 'basic', optionLabel: 'Basic' },
        { fieldId: 'premium', fieldName: 'coverage_premium', optionKey: 'premium', optionLabel: 'Premium' },
      ],
    };
    const result = applyRadioGroupSuggestions(
      [
        makeCheckbox('single', 'status_single', 10),
        makeCheckbox('married', 'status_married', 40),
        makeCheckbox('basic', 'coverage_basic', 70),
        makeCheckbox('premium', 'coverage_premium', 100),
      ],
      [SUGGESTION, secondSuggestion],
    );

    expect(result.appliedSuggestionIds).toEqual(['marital-status', 'coverage-level']);
    expect(result.fields.filter((field) => field.type === 'radio')).toHaveLength(4);
    expect(result.fields.find((field) => field.id === 'basic')?.radioGroupKey).toBe('coverage_level');
  });

  it('identifies legacy suggestion ids so the workspace can skip auto-applying them', () => {
    expect(isLegacyRadioGroupSuggestion({
      ...SUGGESTION,
      id: 'legacy_marital_status',
    })).toBe(true);
    expect(isLegacyRadioGroupSuggestion(SUGGESTION)).toBe(false);
  });

  it('auto-applies only high-confidence non-legacy suggestions', () => {
    expect(shouldAutoApplyRadioGroupSuggestion({
      ...SUGGESTION,
      confidence: 0.6,
    })).toBe(true);
    expect(shouldAutoApplyRadioGroupSuggestion({
      ...SUGGESTION,
      confidence: 0.59,
    })).toBe(false);
    expect(shouldAutoApplyRadioGroupSuggestion({
      ...SUGGESTION,
      id: 'legacy_marital_status',
      confidence: 0.95,
    })).toBe(false);
  });

  it('derives confidence tiers for suggestion review styling', () => {
    expect(radioGroupSuggestionConfidenceTier({
      ...SUGGESTION,
      confidence: 0.9,
    })).toBe('high');
    expect(radioGroupSuggestionConfidenceTier({
      ...SUGGESTION,
      confidence: 0.45,
    })).toBe('medium');
    expect(radioGroupSuggestionConfidenceTier({
      ...SUGGESTION,
      confidence: 0.2,
    })).toBe('low');
  });
});
