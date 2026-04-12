const DEFAULT_FORM_CATALOG_ASSET_BASE = '/form-catalog-assets';

export function normalizeFormCatalogAssetBase(rawBase) {
  const trimmedBase = String(rawBase || '').trim();
  if (!trimmedBase) {
    return DEFAULT_FORM_CATALOG_ASSET_BASE;
  }
  return trimmedBase.replace(/\/+$/, '') || DEFAULT_FORM_CATALOG_ASSET_BASE;
}

function readRuntimeAssetBase() {
  if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_FORM_CATALOG_ASSET_BASE) {
    return import.meta.env.VITE_FORM_CATALOG_ASSET_BASE;
  }

  if (typeof process !== 'undefined' && process?.env) {
    return process.env.VITE_FORM_CATALOG_ASSET_BASE || process.env.FORM_CATALOG_ASSET_BASE || '';
  }

  return '';
}

export function resolveFormCatalogAssetBase(rawBase = readRuntimeAssetBase()) {
  return normalizeFormCatalogAssetBase(rawBase);
}

export const FORM_CATALOG_ASSET_BASE = resolveFormCatalogAssetBase();

export function buildFormCatalogAssetUrl(relativePath = '', assetBase = FORM_CATALOG_ASSET_BASE) {
  const normalizedRelativePath = String(relativePath || '').replace(/^\/+/, '');
  return normalizedRelativePath
    ? `${normalizeFormCatalogAssetBase(assetBase)}/${normalizedRelativePath}`
    : normalizeFormCatalogAssetBase(assetBase);
}
