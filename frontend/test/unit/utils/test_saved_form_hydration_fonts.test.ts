import { describe, expect, it } from 'vitest';
import { buildSavedFormEditorSnapshot, normalizeSavedFormEditorSnapshot } from '../../../src/utils/savedFormHydration';

const pageSizes = { 1: { width: 612, height: 792 } };
const fields = [
  {
    id: 'field-1',
    name: 'legal_name',
    type: 'text' as const,
    page: 1,
    rect: { x: 10, y: 10, width: 120, height: 20 },
    value: null,
    fontName: 'global' as const,
    fontSize: 'global' as const,
  },
];

describe('saved form font hydration', () => {
  it('persists workspace appearance and per-field font choices', () => {
    const snapshot = buildSavedFormEditorSnapshot({
      pageCount: 1,
      pageSizes,
      fields,
      globalFieldFont: 'Times-Roman',
      globalFieldFontSize: 12,
      hasRenamedFields: false,
      hasMappedSchema: false,
    });

    expect(snapshot.appearance.globalFieldFont).toBe('Times-Roman');
    expect(snapshot.appearance.globalFieldFontSize).toBe(12);
    expect(snapshot.fields[0].fontName).toBe('global');
    expect(snapshot.fields[0].fontSize).toBe('global');
  });

  it('hydrates old snapshots with default appearance', () => {
    const snapshot = normalizeSavedFormEditorSnapshot({
      version: 1,
      pageCount: 1,
      pageSizes,
      fields,
      hasRenamedFields: false,
      hasMappedSchema: false,
    });

    expect(snapshot?.appearance.globalFieldFont).toBe('default');
    expect(snapshot?.appearance.globalFieldFontSize).toBe('auto');
    expect(snapshot?.fields[0].fontName).toBe('global');
    expect(snapshot?.fields[0].fontSize).toBe('global');
  });

  it('hydrates global and field font sizes', () => {
    const snapshot = normalizeSavedFormEditorSnapshot({
      version: 2,
      pageCount: 1,
      pageSizes,
      appearance: { globalFieldFont: 'Times-Roman', globalFieldFontSize: 14 },
      fields: [{ ...fields[0], fontSize: 9 }],
      hasRenamedFields: false,
      hasMappedSchema: false,
    });

    expect(snapshot?.appearance.globalFieldFontSize).toBe(14);
    expect(snapshot?.fields[0].fontSize).toBe(9);
  });

  it('hydrates DullyPDF-only field metadata', () => {
    const snapshot = normalizeSavedFormEditorSnapshot({
      version: 2,
      pageCount: 1,
      pageSizes,
      fields: [
        {
          id: 'image-1',
          name: 'profile_photo',
          type: 'image',
          page: 1,
          rect: { x: 10, y: 10, width: 120, height: 80 },
          value: null,
          imageDataUrl: 'data:image/png;base64,abc',
          imageMimeType: 'image/png',
          imageName: 'profile.png',
        },
        {
          id: 'pdf417-1',
          name: 'license_pdf417',
          type: 'pdf417',
          page: 1,
          rect: { x: 20, y: 120, width: 220, height: 78 },
          value: null,
          pdf417Name: 'Ada Lovelace',
          pdf417Dob: '1815-12-10',
          pdf417Data: {
            firstName: 'Ada',
            lastName: 'Lovelace',
            dob: '1815-12-10',
            customerId: 'AL-1',
          },
          pdf417FieldMappings: {
            firstName: { fieldId: 'source-first', fieldName: 'First Name' },
            dob: { fieldId: 'source-dob', fieldName: 'DOB' },
          },
        },
        {
          id: 'barcode-1',
          name: 'member_barcode',
          type: 'barcode',
          page: 1,
          rect: { x: 20, y: 220, width: 220, height: 52 },
          value: '123456789',
          barcodeSourceField: { fieldId: 'source-id', fieldName: 'Member ID' },
        },
      ],
      hasRenamedFields: false,
      hasMappedSchema: false,
    });

    expect(snapshot?.fields).toHaveLength(3);
    expect(snapshot?.fields[0]).toMatchObject({
      type: 'image',
      imageDataUrl: 'data:image/png;base64,abc',
      imageMimeType: 'image/png',
      imageName: 'profile.png',
    });
    expect(snapshot?.fields[1]).toMatchObject({
      type: 'pdf417',
      pdf417Name: 'Ada Lovelace',
      pdf417Dob: '1815-12-10',
      pdf417Data: {
        firstName: 'Ada',
        lastName: 'Lovelace',
        dob: '1815-12-10',
        customerId: 'AL-1',
      },
      pdf417FieldMappings: {
        firstName: { fieldId: 'source-first', fieldName: 'First Name' },
        dob: { fieldId: 'source-dob', fieldName: 'DOB' },
      },
    });
    expect(snapshot?.fields[2]).toMatchObject({
      type: 'barcode',
      value: '123456789',
      barcodeSourceField: { fieldId: 'source-id', fieldName: 'Member ID' },
    });
  });

  it('hydrates calculation field metadata for text fields', () => {
    const snapshot = normalizeSavedFormEditorSnapshot({
      version: 2,
      pageCount: 1,
      pageSizes,
      fields: [
        {
          ...fields[0],
          readOnly: true,
          required: true,
          valueType: 'integer',
          calculation: {
            role: 'calculated_output',
            valueType: 'integer',
            formula: {
              kind: 'binary',
              op: '+',
              left: { kind: 'field', fieldId: 'hours' },
              right: { kind: 'constant', value: 2 },
            },
            dependencies: ['hours'],
            output: { valueType: 'integer', rounding: 'round' },
          },
        },
      ],
      hasRenamedFields: false,
      hasMappedSchema: false,
    });

    expect(snapshot?.fields[0]).toMatchObject({
      readOnly: true,
      required: true,
      valueType: 'integer',
      calculation: {
        role: 'calculated_output',
        dependencies: ['hours'],
        output: { valueType: 'integer', rounding: 'round' },
      },
    });
  });
});
