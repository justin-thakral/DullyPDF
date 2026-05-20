import { describe, expect, it } from 'vitest';

import type { PdfField } from '../../../src/types';
import { applySearchFillRowToFieldsWithStats } from '../../../src/utils/searchFillApply';

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

describe('Search & Fill calculation field behavior', () => {
  it('fills number inputs and leaves calculated fields for backend materialization', () => {
    const fields = [
      textField('base', 'base_premium', {
        value: '',
        valueType: 'integer',
        calculation: { role: 'number_input', valueType: 'integer' },
      }),
      textField('subtotal', 'premium_subtotal', {
        value: 'old subtotal',
        valueType: 'integer',
        readOnly: true,
        calculation: {
          role: 'calculated_intermediate',
          valueType: 'integer',
          formula: { kind: 'field', fieldId: 'base' },
        },
      }),
      textField('total', 'premium_total', {
        value: 'old total',
        valueType: 'integer',
        readOnly: true,
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          formula: { kind: 'field', fieldId: 'subtotal' },
        },
      }),
    ];

    const result = applySearchFillRowToFieldsWithStats({
      row: {
        base_premium: '12',
        premium_subtotal: '999',
        premium_total: '1000',
      },
      fields,
      dataSourceKind: 'csv',
    });

    const byId = new Map(result.fields.map((field) => [field.id, field]));
    expect(byId.get('base')?.value).toBe('12');
    expect(byId.get('subtotal')?.value).toBe('old subtotal');
    expect(byId.get('total')?.value).toBe('old total');
    expect(result.matchedFieldCount).toBe(1);
    expect(result.changedFieldCount).toBe(1);
  });
});
