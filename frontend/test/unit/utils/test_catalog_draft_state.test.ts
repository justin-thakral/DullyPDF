import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PdfField } from '../../../src/types';
import {
  clearCatalogDraftState,
  readCatalogDraftState,
  writeCatalogDraftState,
} from '../../../src/utils/catalogDraftState';

function makeField(overrides: Partial<PdfField> = {}): PdfField {
  return {
    id: 'field-1',
    name: 'full_name',
    type: 'text',
    page: 1,
    rect: { x: 10, y: 20, width: 100, height: 16 },
    value: 'Alice',
    fontName: 'Courier-Bold',
    fontSize: 12,
    fontColor: '#456def',
    textAlign: 'center',
    ...overrides,
  };
}

describe('catalogDraftState', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it('round-trips catalog edits and pending download actions', () => {
    writeCatalogDraftState({
      version: 1,
      slug: 'w-9',
      sourceFileName: 'w-9__fw9.pdf',
      fields: [makeField()],
      checkboxRules: [{ fieldId: 'checkbox-1', matchValue: 'yes' }],
      textTransformRules: [{ fieldId: 'field-1', sourceFieldId: 'field-2', transform: 'split', separator: ' ', index: 0 }],
      globalFieldFont: 'Times-Roman',
      globalFieldFontSize: 14,
      globalFieldFontColor: '#123abc',
      globalFieldAlignment: 'right',
      hasRenamedFields: true,
      hasMappedSchema: true,
      currentPage: 2,
      scale: 1.35,
      pendingAction: { type: 'download', exportMode: 'flat' },
      updatedAtMs: Date.now(),
    });

    expect(readCatalogDraftState()).toEqual({
      version: 1,
      slug: 'w-9',
      sourceFileName: 'w-9__fw9.pdf',
      fields: [makeField()],
      checkboxRules: [{ fieldId: 'checkbox-1', matchValue: 'yes' }],
      textTransformRules: [{ fieldId: 'field-1', sourceFieldId: 'field-2', transform: 'split', separator: ' ', index: 0 }],
      globalFieldFont: 'Times-Roman',
      globalFieldFontSize: 14,
      globalFieldFontColor: '#123abc',
      globalFieldAlignment: 'right',
      hasRenamedFields: true,
      hasMappedSchema: true,
      currentPage: 2,
      scale: 1.35,
      pendingAction: { type: 'download', exportMode: 'flat' },
      updatedAtMs: expect.any(Number),
    });
  });

  it('normalizes malformed optional values without losing the catalog slug', () => {
    window.sessionStorage.setItem('dullypdf.catalogDraftState', JSON.stringify({
      version: 1,
      slug: ' w-9 ',
      fields: null,
      checkboxRules: null,
      textTransformRules: null,
      globalFieldFont: '',
      globalFieldFontSize: '',
      globalFieldFontColor: '',
      globalFieldAlignment: '',
      currentPage: -1,
      scale: 0,
      pendingAction: { type: 'download', exportMode: 'bad-mode' },
      updatedAtMs: Date.now(),
    }));

    expect(readCatalogDraftState()).toEqual(expect.objectContaining({
      slug: 'w-9',
      sourceFileName: null,
      fields: [],
      checkboxRules: [],
      textTransformRules: [],
      globalFieldFont: 'default',
      globalFieldFontSize: 'auto',
      globalFieldFontColor: '#000000',
      globalFieldAlignment: 'left',
      currentPage: 1,
      scale: 1,
      pendingAction: null,
    }));
  });

  it('drops expired or invalid drafts', () => {
    window.sessionStorage.setItem('dullypdf.catalogDraftState', JSON.stringify({
      version: 1,
      slug: 'w-9',
      updatedAtMs: Date.now() - 7 * 60 * 60 * 1000,
    }));

    expect(readCatalogDraftState()).toBeNull();
    expect(window.sessionStorage.getItem('dullypdf.catalogDraftState')).toBeNull();

    window.sessionStorage.setItem('dullypdf.catalogDraftState', '{bad json');
    expect(readCatalogDraftState()).toBeNull();
    expect(window.sessionStorage.getItem('dullypdf.catalogDraftState')).toBeNull();
  });

  it('clears persisted catalog draft state', () => {
    writeCatalogDraftState({
      version: 1,
      slug: 'w-9',
      sourceFileName: null,
      fields: [],
      checkboxRules: [],
      textTransformRules: [],
      globalFieldFont: 'default',
      globalFieldFontSize: 'auto',
      globalFieldFontColor: '#000000',
      globalFieldAlignment: 'left',
      hasRenamedFields: false,
      hasMappedSchema: false,
      currentPage: 1,
      scale: 1,
      pendingAction: { type: 'save' },
      updatedAtMs: Date.now(),
    });

    clearCatalogDraftState();
    expect(readCatalogDraftState()).toBeNull();
  });
});
