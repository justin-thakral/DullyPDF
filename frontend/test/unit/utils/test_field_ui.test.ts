import { describe, expect, it } from 'vitest';
import type { FieldType } from '../../../src/types';

import {
  CREATE_TOOLS,
  DULLYPDF_ONLY_CREATE_TOOLS,
  FIELD_TYPES,
  NATIVE_CREATE_TOOLS,
  fieldTypeLabel,
} from '../../../src/utils/fieldUi';

describe('fieldUi utils', () => {
  it('keeps field type ordering stable for dropdown rendering', () => {
    expect(FIELD_TYPES).toEqual(['text', 'signature', 'checkbox', 'radio', 'image', 'pdf417', 'barcode', 'qr']);
  });

  it('splits native and DullyPDF-only create tools', () => {
    expect(NATIVE_CREATE_TOOLS).toEqual(['text', 'signature', 'checkbox', 'radio', 'quick-radio']);
    expect(DULLYPDF_ONLY_CREATE_TOOLS).toEqual(['image', 'pdf417', 'barcode', 'qr']);
    expect(CREATE_TOOLS).toEqual([
      'text',
      'signature',
      'checkbox',
      'radio',
      'quick-radio',
      'image',
      'pdf417',
      'barcode',
      'qr',
      'number-input',
      'calculated-output',
    ]);
  });

  it('maps known field types to expected labels', () => {
    expect(fieldTypeLabel('text')).toBe('Text');
    expect(fieldTypeLabel('signature')).toBe('Signature');
    expect(fieldTypeLabel('checkbox')).toBe('Checkbox');
    expect(fieldTypeLabel('radio')).toBe('Radio');
    expect(fieldTypeLabel('image')).toBe('Image');
    expect(fieldTypeLabel('pdf417')).toBe('PDF417');
    expect(fieldTypeLabel('barcode')).toBe('1D Barcode');
    expect(fieldTypeLabel('qr')).toBe('QR Code');
  });

  it('uses a generic fallback label for unknown field types', () => {
    expect(fieldTypeLabel('custom_field' as FieldType)).toBe('Field');
  });
});
