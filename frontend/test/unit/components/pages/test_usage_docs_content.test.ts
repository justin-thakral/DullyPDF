import { describe, expect, it } from 'vitest';
import { resolveUsageDocsPath, usageDocsHref } from '../../../../src/components/pages/usageDocsContent';

describe('usageDocsContent route resolver', () => {
  it('resolves canonical /es/usage-docs routes', () => {
    expect(resolveUsageDocsPath('/es/usage-docs')).toEqual({ kind: 'canonical', pageKey: 'index' });
    expect(resolveUsageDocsPath('/es/usage-docs/search-fill')).toEqual({ kind: 'canonical', pageKey: 'search-fill' });
    expect(resolveUsageDocsPath('/es/usage-docs/fill-by-link')).toEqual({ kind: 'canonical', pageKey: 'fill-by-link' });
    expect(resolveUsageDocsPath('/es/usage-docs/signature-workflow')).toEqual({ kind: 'canonical', pageKey: 'signature-workflow' });
    expect(resolveUsageDocsPath('/es/usage-docs/api-fill')).toEqual({ kind: 'canonical', pageKey: 'api-fill' });
    expect(resolveUsageDocsPath('/es/usage-docs/search-fill/')).toEqual({ kind: 'canonical', pageKey: 'search-fill' });
  });

  it('returns not-found for unknown or nested usage-docs slugs', () => {
    expect(resolveUsageDocsPath('/es/usage-docs/not-real')).toEqual({
      kind: 'not-found',
      requestedPath: '/es/usage-docs/not-real',
    });
    expect(resolveUsageDocsPath('/es/usage-docs/search-fill/details')).toEqual({
      kind: 'not-found',
      requestedPath: '/es/usage-docs/search-fill/details',
    });
  });

  it('returns redirect targets for /docs aliases', () => {
    expect(resolveUsageDocsPath('/usage-docs')).toEqual({ kind: 'redirect', targetPath: '/es/usage-docs' });
    expect(resolveUsageDocsPath('/usage-docs/search-fill')).toEqual({
      kind: 'redirect',
      targetPath: '/es/usage-docs/search-fill',
    });
    expect(resolveUsageDocsPath('/docs')).toEqual({ kind: 'redirect', targetPath: '/es/usage-docs' });
    expect(resolveUsageDocsPath('/docs/search-fill')).toEqual({
      kind: 'redirect',
      targetPath: '/es/usage-docs/search-fill',
    });
    expect(resolveUsageDocsPath('/docs/search-fill/extra')).toEqual({
      kind: 'redirect',
      targetPath: '/es/usage-docs/search-fill/extra',
    });
  });

  it('builds canonical usage-docs hrefs', () => {
    expect(usageDocsHref('index')).toBe('/es/usage-docs');
    expect(usageDocsHref('detection')).toBe('/es/usage-docs/detection');
    expect(usageDocsHref('signature-workflow')).toBe('/es/usage-docs/signature-workflow');
    expect(usageDocsHref('create-group')).toBe('/es/usage-docs/create-group');
  });
});
