import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FORM_CATALOG_ASSET_BASE,
  buildFormCatalogAssetUrl,
  normalizeFormCatalogAssetBase,
  resolveFormCatalogAssetBase,
} from '../../../src/config/formCatalogAssetBase.mjs';

describe('formCatalogAssetBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to the local dev asset prefix when the configured base is blank', () => {
    expect(resolveFormCatalogAssetBase('')).toBe('/form-catalog-assets');
    expect(buildFormCatalogAssetUrl('healthcare/cms-855i__cms855i.pdf'))
      .toBe(`${FORM_CATALOG_ASSET_BASE}/healthcare/cms-855i__cms855i.pdf`);
    expect(buildFormCatalogAssetUrl(
      'healthcare/cms-855i__cms855i.pdf',
      resolveFormCatalogAssetBase(''),
    ))
      .toBe('/form-catalog-assets/healthcare/cms-855i__cms855i.pdf');
  });

  it('normalizes configured asset bases without trailing slashes', () => {
    expect(normalizeFormCatalogAssetBase('https://storage.googleapis.com/example-bucket/'))
      .toBe('https://storage.googleapis.com/example-bucket');
    expect(normalizeFormCatalogAssetBase('  https://storage.googleapis.com/example-bucket/path//  '))
      .toBe('https://storage.googleapis.com/example-bucket/path');
  });

  it('reads runtime overrides from env when requested', () => {
    vi.stubEnv('VITE_FORM_CATALOG_ASSET_BASE', 'https://storage.googleapis.com/example-bucket/');
    expect(resolveFormCatalogAssetBase()).toBe('https://storage.googleapis.com/example-bucket');
    expect(buildFormCatalogAssetUrl(
      'healthcare/cms-855i__cms855i.pdf',
      resolveFormCatalogAssetBase(),
    ))
      .toBe('https://storage.googleapis.com/example-bucket/healthcare/cms-855i__cms855i.pdf');
  });
});
