import { describe, expect, it } from 'vitest';

import type { CheckboxRule, PdfField, RadioGroupSuggestion } from '../../../src/types';
import {
  applyMappingPayloadToFields,
  deriveCombinedRadioGroupSuggestions,
  deriveRadioGroupSuggestionsFromFieldHeuristics,
  deriveRadioGroupSuggestionsFromCheckboxRules,
  mergeRadioGroupSuggestions,
} from '../../../src/utils/openAiFields';

function makeCheckbox(id: string, name: string, optionKey: string): PdfField {
  return {
    id,
    name,
    type: 'checkbox',
    page: 1,
    rect: { x: 10, y: 10, width: 14, height: 14 },
    value: null,
    groupKey: 'marital_status',
    optionKey,
    optionLabel: optionKey[0].toUpperCase() + optionKey.slice(1),
    groupLabel: 'Marital Status',
  };
}

const RULES: CheckboxRule[] = [{
  groupKey: 'marital_status',
  operation: 'enum',
  databaseField: 'marital_status',
  confidence: 0.81,
}];

describe('openAiFields radio suggestion helpers', () => {
  it('derives radio suggestions from enum checkbox rules', () => {
    const suggestions = deriveRadioGroupSuggestionsFromCheckboxRules([
      makeCheckbox('single', 'i_marital_status_single', 'single'),
      makeCheckbox('married', 'i_marital_status_married', 'married'),
    ], RULES);

    expect(suggestions).toEqual([
      expect.objectContaining({
        id: 'rule_marital_status',
        groupKey: 'marital_status',
        sourceField: 'marital_status',
        selectionReason: 'enum',
      }),
    ]);
    expect(suggestions[0]?.suggestedFields).toEqual(expect.arrayContaining([
      expect.objectContaining({ fieldId: 'single', optionKey: 'single' }),
      expect.objectContaining({ fieldId: 'married', optionKey: 'married' }),
    ]));
  });

  it('keeps explicit mapping suggestions ahead of rule-derived fallbacks', () => {
    const explicit: RadioGroupSuggestion = {
      id: 'explicit_marital_status',
      suggestedType: 'radio_group',
      groupKey: 'marital_status',
      groupLabel: 'Marital Status',
      sourceField: 'marital_status_value',
      suggestedFields: [
        { fieldId: 'single', fieldName: 'i_marital_status_single', optionKey: 'single', optionLabel: 'Single' },
        { fieldId: 'married', fieldName: 'i_marital_status_married', optionKey: 'married', optionLabel: 'Married' },
      ],
    };

    const merged = mergeRadioGroupSuggestions(
      [explicit],
      deriveRadioGroupSuggestionsFromCheckboxRules([
        makeCheckbox('single', 'i_marital_status_single', 'single'),
        makeCheckbox('married', 'i_marital_status_married', 'married'),
      ], RULES),
    );

    expect(merged).toEqual([explicit]);
  });

  it('falls back to rule-derived suggestions when mapping returns checkbox rules only', () => {
    const result = applyMappingPayloadToFields(
      [
        makeCheckbox('single', 'status_single', 'single'),
        makeCheckbox('married', 'status_married', 'married'),
      ],
      {
        mappings: [
          { originalPdfField: 'status_single', pdfField: 'i_marital_status_single', confidence: 0.92 },
          { originalPdfField: 'status_married', pdfField: 'i_marital_status_married', confidence: 0.91 },
        ],
        checkboxRules: RULES,
        radioGroupSuggestions: [],
        textTransformRules: [],
      },
      [],
    );

    expect(result.fields.map((field) => field.name)).toEqual([
      'i_marital_status_single',
      'i_marital_status_married',
    ]);
    expect(result.radioGroupSuggestions).toEqual([
      expect.objectContaining({
        id: 'rule_marital_status',
        groupKey: 'marital_status',
      }),
    ]);
  });

  it('infers a compact renamed enum row as a radio suggestion without checkbox rules', () => {
    const result = deriveRadioGroupSuggestionsFromFieldHeuristics([
      {
        ...makeCheckbox('single', 'i_marital_status_single', 'single'),
        renameConfidence: 0.92,
        rect: { x: 10, y: 10, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('married', 'i_marital_status_married', 'married'),
        renameConfidence: 0.92,
        rect: { x: 40, y: 10, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('divorced', 'i_marital_status_divorced', 'divorced'),
        renameConfidence: 0.92,
        rect: { x: 70, y: 10, width: 14, height: 14 },
      },
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        id: 'inferred_marital_status',
        groupKey: 'marital_status',
        selectionReason: 'label_pattern',
      }),
    ]);
    expect(result[0]?.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it('does not infer large multi-select checklists as radio suggestions', () => {
    const result = deriveRadioGroupSuggestionsFromFieldHeuristics([
      {
        ...makeCheckbox('anemia', 'i_medical_history_anemia', 'anemia'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 10, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('asthma', 'i_medical_history_asthma', 'asthma'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 34, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('cancer', 'i_medical_history_cancer', 'cancer'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 58, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('diabetes', 'i_medical_history_diabetes', 'diabetes'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 82, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('epilepsy', 'i_medical_history_epilepsy', 'epilepsy'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 106, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('glaucoma', 'i_medical_history_glaucoma', 'glaucoma'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 130, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('hepatitis', 'i_medical_history_hepatitis', 'hepatitis'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 154, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('jaundice', 'i_medical_history_jaundice', 'jaundice'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 178, width: 14, height: 14 },
      },
      {
        ...makeCheckbox('kidney', 'i_medical_history_kidney', 'kidney'),
        groupKey: 'medical_history',
        renameConfidence: 0.9,
        rect: { x: 10, y: 202, width: 14, height: 14 },
      },
    ]);

    expect(result).toEqual([]);
  });

  it('combines rule-based and heuristic suggestions without duplicating the same group', () => {
    const fields = [
      makeCheckbox('single', 'i_marital_status_single', 'single'),
      makeCheckbox('married', 'i_marital_status_married', 'married'),
    ];
    const result = deriveCombinedRadioGroupSuggestions(fields, [], RULES);

    expect(result).toHaveLength(1);
    expect(result[0]?.groupKey).toBe('marital_status');
  });
});
