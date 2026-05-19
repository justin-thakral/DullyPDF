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
});
