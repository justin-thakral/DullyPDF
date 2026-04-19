import { describe, expect, it } from 'vitest';
import {
  INTENT_CATALOG_SHOWCASE_PAGE_KEYS,
  buildIntentCatalogWorkflowSteps,
  getIntentCatalogShowcase,
} from '../../../src/config/intentCatalogShowcases.mjs';

describe('intentCatalogShowcases', () => {
  it('keeps every curated showcase at 4 featured documents and 10 total forms', () => {
    for (const pageKey of INTENT_CATALOG_SHOWCASE_PAGE_KEYS) {
      const showcase = getIntentCatalogShowcase(pageKey);

      expect(showcase).toBeTruthy();
      expect(showcase.featuredDocuments).toHaveLength(4);
      expect(showcase.documents).toHaveLength(10);
      expect(new Set(showcase.documents.map((document) => document.slug)).size).toBe(10);
      expect(showcase.documents.every((document) => document.editorHref.startsWith('/upload?catalogSlug='))).toBe(true);
      expect(showcase.documents.every((document) => document.catalogHref.startsWith('/forms/'))).toBe(true);
      expect(showcase.documents.every((document) => !document.sourceUrl.includes('sites/default/files'))).toBe(true);
      expect(showcase.documents.every((document) => document.thumbnailUrl.endsWith('.webp'))).toBe(true);
      expect(showcase.documents.every((document) => !/^Use Form\b/i.test(document.description))).toBe(true);
      expect(showcase.documents.every((document) => document.description.split(/\s+/).length >= 18)).toBe(true);
    }
  });

  it('keeps workflow guidance aligned with csv, sql, json, api, web form, and signature flows', () => {
    for (const pageKey of INTENT_CATALOG_SHOWCASE_PAGE_KEYS) {
      const showcase = getIntentCatalogShowcase(pageKey);
      const steps = buildIntentCatalogWorkflowSteps(showcase);

      expect(steps.length).toBeGreaterThanOrEqual(6);
      expect(steps[0]?.href).toBe(showcase.featuredDocuments[0]?.catalogHref);
      expect(steps[0]?.editorHref).toBe(showcase.featuredDocuments[0]?.editorHref);
      expect(steps.some((step) => /csv|xlsx|json|sql/i.test(step.description))).toBe(true);
      expect(steps.some((step) => step.href === '/usage-docs/api-fill')).toBe(true);
      expect(steps.some((step) => step.href === '/usage-docs/fill-by-link')).toBe(true);
      expect(steps.some((step) => step.href === '/usage-docs/signature-workflow')).toBe(true);
    }
  });

  it('keeps curated documents unique across showcase pages', () => {
    const slugs = INTENT_CATALOG_SHOWCASE_PAGE_KEYS.flatMap((pageKey) =>
      getIntentCatalogShowcase(pageKey).documents.map((document) => document.slug),
    );

    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
