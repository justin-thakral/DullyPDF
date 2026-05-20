import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PdfField } from '../../../src/types';
import {
  PHOTO_FIELD_NAME_MARKER,
  buildTemplateFields,
  createField,
  ensureUniqueFieldName,
  formatSize,
  makeId,
  prepareFieldsForMaterialize,
} from '../../../src/utils/fields';

const existingField = (name: string): PdfField => ({
  id: `${name}-id`,
  name,
  type: 'text',
  page: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('fields utils', () => {
  describe('ensureUniqueFieldName', () => {
    it('returns a trimmed base name when unused and tracks it in the set', () => {
      const existing = new Set<string>(['text_field_1']);

      const unique = ensureUniqueFieldName('  patient_name  ', existing);

      expect(unique).toBe('patient_name');
      expect(existing.has('patient_name')).toBe(true);
    });

    it('adds numeric suffixes and skips already-used suffix values', () => {
      const existing = new Set<string>(['field', 'field_1', 'field_2', 'field_4']);

      const unique = ensureUniqueFieldName('field', existing);

      expect(unique).toBe('field_3');
      expect(existing.has('field_3')).toBe(true);
    });

    it('falls back to "field" when base name is blank', () => {
      expect(ensureUniqueFieldName('   ', new Set())).toBe('field');
      expect(ensureUniqueFieldName('', new Set(['field']))).toBe('field_1');
    });
  });

  describe('createField', () => {
    it('applies default sizes and center placement for each field type', () => {
      const pageSize = { width: 500, height: 400 };

      const cases = [
        {
          type: 'text' as const,
          expectedName: 'text_field',
          expectedRect: { x: 160, y: 189, width: 180, height: 22 },
        },
        {
          type: 'signature' as const,
          expectedName: 'signature',
          expectedRect: { x: 140, y: 184, width: 220, height: 32 },
        },
        {
          type: 'checkbox' as const,
          expectedName: 'i_checkbox',
          expectedRect: { x: 243, y: 193, width: 14, height: 14 },
        },
        {
          type: 'radio' as const,
          expectedName: 'radio_option',
          expectedRect: { x: 243, y: 193, width: 14, height: 14 },
        },
        {
          type: 'image' as const,
          expectedName: 'image_field',
          expectedRect: { x: 160, y: 140, width: 180, height: 120 },
        },
        {
          type: 'pdf417' as const,
          expectedName: 'pdf417_barcode',
          expectedRect: { x: 140, y: 161, width: 220, height: 78 },
        },
        {
          type: 'barcode' as const,
          expectedName: 'id_barcode',
          expectedRect: { x: 140, y: 174, width: 220, height: 52 },
        },
        {
          type: 'qr' as const,
          expectedName: 'qr_code',
          expectedRect: { x: 195, y: 145, width: 110, height: 110 },
        },
      ];

      for (const entry of cases) {
        const field = createField(entry.type, 2, pageSize, []);

        expect(field.id).toEqual(expect.any(String));
        expect(field.type).toBe(entry.type);
        expect(field.page).toBe(2);
        expect(field.name).toBe(entry.expectedName);
        expect(field.rect).toEqual(entry.expectedRect);
      }
    });

    it('clamps centered geometry to page bounds when defaults exceed page size', () => {
      const field = createField('text', 0, { width: 100, height: 10 }, []);

      expect(field.rect).toEqual({
        x: 0,
        y: 0,
        width: 100,
        height: 10,
      });
    });

    it('uses existing field names to pick the next available suffix', () => {
      const existing = [
        existingField('text_field'),
        existingField('text_field_1'),
        existingField('text_field_2'),
      ];

      const field = createField('text', 0, { width: 500, height: 400 }, existing);

      expect(field.name).toBe('text_field_3');
    });
  });

  describe('makeId', () => {
    it('uses crypto.randomUUID when available', () => {
      const randomUUID = vi.fn(() => 'uuid-123');
      vi.stubGlobal('crypto', { randomUUID });

      expect(makeId()).toBe('uuid-123');
      expect(randomUUID).toHaveBeenCalledTimes(1);
    });

    it('falls back to timestamp/random-based ids when randomUUID is missing', () => {
      vi.stubGlobal('crypto', {});
      vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      expect(makeId()).toBe('field_1700000000000_8');
    });
  });

  it('formats field size with rounded width and height values', () => {
    expect(formatSize({ x: 0, y: 0, width: 11.6, height: 9.2 })).toBe('12 x 9');
  });

  it('preserves calculation-capable field metadata in template payloads', () => {
    const [field] = buildTemplateFields([
      {
        ...existingField('total'),
        readOnly: true,
        required: true,
        valueType: 'integer',
        calculation: {
          role: 'calculated_output',
          valueType: 'integer',
          formula: {
            kind: 'binary',
            op: '+',
            left: { kind: 'field', fieldId: 'subtotal' },
            right: { kind: 'constant', value: 5 },
          },
          dependencies: ['subtotal'],
          output: { valueType: 'integer', rounding: 'round' },
        },
      },
    ]);

    expect(field).toMatchObject({
      name: 'total',
      readOnly: true,
      required: true,
      valueType: 'integer',
      calculation: {
        role: 'calculated_output',
        dependencies: ['subtotal'],
      },
    });
  });

  it('adds blank marker text anchors when preserving app-only fields for editable exports', () => {
    const imageField: PdfField = {
      id: 'photo-id',
      name: 'photo',
      type: 'image',
      page: 1,
      rect: { x: 10, y: 20, width: 80, height: 60 },
      value: null,
      imageDataUrl: 'data:image/png;base64,abc',
      imageMimeType: 'image/png',
      imageName: 'photo.png',
    };

    const fields = prepareFieldsForMaterialize(
      [imageField],
      undefined,
      undefined,
      { preserveAppOnlyFieldMarkers: true },
    );

    expect(fields).toHaveLength(2);
    expect(fields[0]).toMatchObject({
      id: 'photo-id',
      type: 'image',
      appOnlyMarkerName: `photo${PHOTO_FIELD_NAME_MARKER}`,
      imageDataUrl: 'data:image/png;base64,abc',
    });
    expect(fields[1]).toMatchObject({
      id: 'photo-id_image_marker',
      name: `photo${PHOTO_FIELD_NAME_MARKER}`,
      type: 'text',
      value: null,
      readOnly: true,
    });
    expect(fields[1].imageDataUrl).toBeUndefined();
  });
});
