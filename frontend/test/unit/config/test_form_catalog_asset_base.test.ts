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

  it('defaults to the local dev asset prefix when no env override is set', () => {
    expect(FORM_CATALOG_ASSET_BASE).toBe('/form-catalog-assets');
    expect(buildFormCatalogAssetUrl('healthcare/cms-855i__cms855i.pdf'))
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
