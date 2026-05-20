import { describe, expect, it } from 'vitest';
import type { PdfField } from '../../../src/types';
import { prepareFieldsForMaterialize } from '../../../src/utils/fields';

function textField(overrides: Partial<PdfField> = {}): PdfField {
  return {
    id: 'field-1',
    name: 'legal_name',
    type: 'text',
    page: 1,
    rect: { x: 10, y: 10, width: 120, height: 20 },
    value: '',
    ...overrides,
  };
}

describe('prepareFieldsForMaterialize font metadata', () => {
  it('omits font metadata when the global font is default', () => {
    const [field] = prepareFieldsForMaterialize([
      textField({ fontName: 'global', value: 'Ada' }),
    ]);

    expect(field.fontName).toBeUndefined();
    expect(field.value).toBe('Ada');
  });

  it('keeps global font choices top-level and preserves explicit field font names', () => {
    const fields = prepareFieldsForMaterialize(
      [
        textField({ id: 'global-field', fontName: 'global' }),
        textField({ id: 'override-field', fontName: 'Courier-Bold' }),
      ],
      'Times-Italic',
    );

    expect(fields[0].fontName).toBeUndefined();
    expect(fields[1].fontName).toBe('Courier-Bold');
  });

  it('keeps global font color top-level and preserves explicit field colors', () => {
    const fields = prepareFieldsForMaterialize(
      [
        textField({ id: 'global-field', fontColor: 'global' }),
        textField({ id: 'override-field', fontColor: '#cc3300' }),
      ],
      'default',
      '#336699',
    );

    expect(fields[0].fontColor).toBeUndefined();
    expect(fields[1].fontColor).toBe('#cc3300');
  });

  it('drops font metadata for non-text fields', () => {
    const [field] = prepareFieldsForMaterialize(
      [
        {
          id: 'check-1',
          name: 'consent',
          type: 'checkbox',
          page: 1,
          rect: { x: 10, y: 10, width: 14, height: 14 },
          value: true,
          fontName: 'Times-Roman',
          fontSize: 14,
        },
      ],
      'Times-Italic',
    );

    expect(field.fontName).toBeUndefined();
    expect(field.fontSize).toBeUndefined();
  });

  it('preserves text field font-size metadata for backend resolution', () => {
    const [field] = prepareFieldsForMaterialize([
      textField({ fontName: 'global', fontSize: 'auto', value: 'Ada' }),
    ]);

    expect(field.fontSize).toBe('auto');
  });

  it('keeps global font size top-level and drops inherited field font-size markers', () => {
    const [field] = prepareFieldsForMaterialize([
      textField({ fontSize: 'global', value: 'Ada' }),
    ]);

    expect(field.fontSize).toBeUndefined();
  });
});
