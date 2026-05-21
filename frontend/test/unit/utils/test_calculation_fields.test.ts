import { describe, expect, it } from 'vitest';

import type { FormulaNode, PdfField } from '../../../src/types';
import {
  buildLinearFormula,
  calculationFieldDefaultsForTool,
  collectCalculationDependencyIds,
  evaluateFormula,
  extractFormulaDependencies,
  formatFormulaForDisplay,
  getFormulaDependencyFields,
  resolveCalculatedFieldPreviewValues,
  topologicallySortCalculatedFields,
  validateCalculationExportReadiness,
  validateFormula,
  wouldCreateCycle,
} from '../../../src/utils/calculationFields';

function textField(id: string, name: string, extra: Partial<PdfField> = {}): PdfField {
  return {
    id,
    name,
    type: 'text',
    page: 1,
    rect: { x: 0, y: 0, width: 100, height: 20 },
    ...extra,
  };
}

describe('calculation field helpers', () => {
  it('creates metadata defaults for calculation create tools', () => {
    expect(calculationFieldDefaultsForTool('number-input')).toMatchObject({
      type: 'text',
      valueType: 'integer',
      readOnly: false,
      calculation: { role: 'number_input', valueType: 'integer' },
    });

    expect(calculationFieldDefaultsForTool('calculated-output')).toMatchObject({
      type: 'text',
      valueType: 'integer',
      readOnly: true,
      calculation: {
        role: 'calculated_output',
        valueType: 'integer',
        dependencies: [],
      },
    });
  });

  it('filters available formula dependency fields', () => {
    const fields = [
      textField('target', 'Total', { valueType: 'integer' }),
      textField('premium', 'Premium', { valueType: 'integer' }),
      textField('external', 'External', {
        valueType: 'decimal',
        calculation: {
          role: 'external_imported_calculation',
          valueType: 'decimal',
          imported: { source: 'acroform_js', supported: false },
        },
      }),
      textField('supported-external', 'Supported External', {
        valueType: 'decimal',
        calculation: {
          role: 'external_imported_calculation',
          valueType: 'decimal',
          imported: { source: 'dullypdf_metadata', supported: true },
        },
      }),
      { ...textField('check', 'Check'), type: 'checkbox' as const },
    ];

    expect(getFormulaDependencyFields(fields, 'target').map((field) => field.id)).toEqual([
      'premium',
      'supported-external',
    ]);
  });

  it('builds and formats a left-associative field formula', () => {
    const formula = buildLinearFormula([
      { fieldId: 'premium', operator: '+' },
      { fieldId: 'tax', operator: '+' },
      { kind: 'constant', value: 10, operator: '-' },
    ]);

    expect(extractFormulaDependencies(formula)).toEqual(['premium', 'tax']);
    expect(formatFormulaForDisplay(formula, [
      textField('premium', 'Premium'),
      textField('tax', 'Tax'),
    ])).toBe('Premium + Tax - 10');
  });

  it('evaluates formula values with output and divide-by-zero behavior', () => {
    const formula = buildLinearFormula([
      { fieldId: 'premium', operator: '+' },
      { fieldId: 'fee', operator: '+' },
      { fieldId: 'factor', operator: '/' },
    ]);

    expect(evaluateFormula(formula, {
      premium: '10.4',
      fee: '',
      factor: '2',
    }, {
      valueType: 'integer',
      rounding: 'round',
      blankInputBehavior: 'treat_as_zero',
      divideByZeroBehavior: 'validation_error',
    })).toEqual({ ok: true, value: 5 });

    expect(evaluateFormula(formula, {
      premium: 10,
      fee: 1,
      factor: 0,
    }, {
      divideByZeroBehavior: 'validation_error',
    })).toMatchObject({ ok: false, error: 'Formula divides by zero.' });
  });

  it('evaluates nested unary formulas with map-backed field values', () => {
    const formula: FormulaNode = {
      kind: 'binary',
      op: '*',
      left: {
        kind: 'unary',
        op: '-',
        value: { kind: 'field', fieldId: 'discount' },
      },
      right: {
        kind: 'binary',
        op: '+',
        left: { kind: 'constant', value: 2 },
        right: { kind: 'field', fieldId: 'quantity' },
      },
    };

    expect(extractFormulaDependencies(formula)).toEqual(['discount', 'quantity']);
    expect(evaluateFormula(formula, new Map<string, unknown>([
      ['discount', '3'],
      ['quantity', 4],
    ]))).toEqual({ ok: true, value: -18 });
  });

  it('resolves chained calculated field preview values with draft overrides', () => {
    const previewValues = resolveCalculatedFieldPreviewValues([
      textField('premium', 'Premium', {
        value: '10',
        valueType: 'integer',
        calculation: { role: 'number_input', valueType: 'integer' },
      }),
      textField('subtotal', 'Subtotal', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_intermediate',
          valueType: 'integer',
          formula: {
            kind: 'binary',
            op: '+',
            left: { kind: 'field', fieldId: 'premium' },
            right: { kind: 'constant', value: 5 },
          },
          output: { valueType: 'integer', rounding: 'round' },
        },
      }),
      textField('total', 'Total', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          formula: {
            kind: 'binary',
            op: '*',
            left: { kind: 'field', fieldId: 'subtotal' },
            right: { kind: 'constant', value: 2 },
          },
          output: { valueType: 'integer', rounding: 'round' },
        },
      }),
    ], { premium: '12' });

    expect(previewValues.get('subtotal')).toBe('17');
    expect(previewValues.get('total')).toBe('34');
  });

  it('validates missing fields, invalid operators, and dependency cycles', () => {
    const fields = [
      textField('target', 'Total', {
        valueType: 'integer',
      }),
      textField('intermediate', 'Intermediate', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_intermediate',
          valueType: 'integer',
          formula: { kind: 'field', fieldId: 'target' },
        },
      }),
    ];

    expect(wouldCreateCycle(fields, 'target', 'intermediate')).toBe(true);
    expect(getFormulaDependencyFields(fields, 'target').map((field) => field.id)).toEqual([]);

    const result = validateFormula({
      kind: 'binary',
      op: '%' as '+',
      left: { kind: 'field', fieldId: 'missing' },
      right: { kind: 'field', fieldId: 'intermediate' },
    }, fields, 'target');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Formula contains an invalid operator.',
      'Formula references a missing field.',
      'Intermediate would create a calculation cycle.',
    ]));
  });

  it('reports invalid formula nodes and invalid unary operators', () => {
    const result = validateFormula({
      kind: 'unary',
      op: '+' as '-',
      value: { kind: 'call' } as unknown as FormulaNode,
    }, [textField('target', 'Total', { valueType: 'integer' })], 'target');

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      'Formula contains an invalid unary operator.',
      'Formula contains an invalid node.',
    ]));
  });

  it('sorts calculated fields before their downstream dependents', () => {
    const intermediate = textField('intermediate', 'Intermediate', {
      valueType: 'integer',
      calculation: {
        role: 'calculated_intermediate',
        valueType: 'integer',
        formula: { kind: 'field', fieldId: 'premium' },
      },
    });
    const total = textField('total', 'Total', {
      valueType: 'integer',
      calculation: {
        role: 'calculated_output',
        valueType: 'integer',
        formula: { kind: 'field', fieldId: 'intermediate' },
      },
    });

    expect(topologicallySortCalculatedFields([
      total,
      intermediate,
      textField('premium', 'Premium', { valueType: 'integer' }),
    ])).toMatchObject({
      orderedFields: [intermediate, total],
      cycleFieldIds: [],
    });
  });

  it('reports cycle participants during topological sorting', () => {
    const left = textField('left', 'Left', {
      valueType: 'integer',
      calculation: {
        role: 'calculated_output',
        valueType: 'integer',
        formula: { kind: 'field', fieldId: 'right' },
      },
    });
    const right = textField('right', 'Right', {
      valueType: 'integer',
      calculation: {
        role: 'calculated_output',
        valueType: 'integer',
        formula: { kind: 'field', fieldId: 'left' },
      },
    });

    const result = topologicallySortCalculatedFields([left, right]);

    expect(new Set(result.cycleFieldIds)).toEqual(new Set(['left', 'right']));
  });

  it('collects direct and nested dependencies for selected calculated fields', () => {
    const fields = [
      textField('premium', 'Premium', { valueType: 'integer' }),
      textField('subtotal', 'Subtotal', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_intermediate',
          valueType: 'integer',
          formula: { kind: 'field', fieldId: 'premium' },
        },
      }),
      textField('total', 'Total', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          formula: { kind: 'field', fieldId: 'subtotal' },
        },
      }),
    ];

    expect(collectCalculationDependencyIds(fields, 'total')).toEqual({
      directDependencyIds: ['subtotal'],
      indirectDependencyIds: ['premium'],
    });
  });

  it('reports calculation export readiness issues for invalid formulas', () => {
    const issues = validateCalculationExportReadiness([
      textField('total', 'Total', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
        },
      }),
    ]);

    expect(issues).toEqual(['Total: Add at least one formula item.']);
  });

  it('reports export readiness issues for invalid numeric inputs and evaluation failures', () => {
    const issues = validateCalculationExportReadiness([
      textField('premium', 'Premium', {
        value: '10.25',
        valueType: 'integer',
        calculation: { role: 'number_input', valueType: 'integer' },
      }),
      textField('divisor', 'Divisor', {
        value: '0',
        valueType: 'integer',
        calculation: { role: 'number_input', valueType: 'integer' },
      }),
      textField('total', 'Total', {
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          formula: {
            kind: 'binary',
            op: '/',
            left: { kind: 'field', fieldId: 'premium' },
            right: { kind: 'field', fieldId: 'divisor' },
          },
          output: {
            valueType: 'integer',
            rounding: 'round',
            divideByZeroBehavior: 'validation_error',
          },
        },
      }),
    ]);

    expect(issues).toEqual(expect.arrayContaining([
      'Premium: Number input must be an integer.',
      'Total: Formula divides by zero.',
    ]));
  });
});
