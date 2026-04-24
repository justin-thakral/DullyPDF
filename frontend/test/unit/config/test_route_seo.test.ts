import { describe, expect, it } from 'vitest';
import { getIntentPages } from '../../../src/config/intentPages';
import { getBlogPost, getBlogPosts } from '../../../src/config/blogPosts';
import { getBlogPostSeo } from '../../../src/config/blogSeo';
import { getFeaturePlanPages } from '../../../src/config/featurePlanPages';
import { getUsageDocsPages } from '../../../src/components/pages/usageDocsContent';
import { INDEXABLE_PUBLIC_ROUTE_PATHS, resolveRouteSeo } from '../../../src/config/routeSeo';
import {
  ALL_ROUTES,
  BLOG_POSTS as STATIC_BLOG_POSTS,
  FEATURE_PLAN_PAGES as STATIC_FEATURE_PLAN_PAGES,
  INTENT_PAGES as STATIC_INTENT_PAGES,
  USAGE_DOCS_PAGES as STATIC_USAGE_DOCS_PAGES,
} from '../../../../scripts/seo-route-data.mjs';

describe('routeSeo config', () => {
  it('keeps indexable canonical paths unique', () => {
    const unique = new Set(INDEXABLE_PUBLIC_ROUTE_PATHS);
    expect(unique.size).toBe(INDEXABLE_PUBLIC_ROUTE_PATHS.length);
  });

  it('resolves canonical homepage metadata', () => {
    const metadata = resolveRouteSeo({ kind: 'app' });
    expect(metadata.canonicalPath).toBe('/');
    expect(metadata.title).toBe('DullyPDF — Automatic PDF to Fillable Form With Search & Fill');
    expect(metadata.keywords).toContain('pdf automation platform');
    const organizationEntry = metadata.structuredData?.find((entry) => entry['@type'] === 'Organization');
    expect(Array.isArray(organizationEntry?.sameAs)).toBe(true);
    expect(organizationEntry?.sameAs).toContain('https://www.linkedin.com/company/dullypdf');
    expect(organizationEntry?.sameAs).toContain('https://github.com/justin-thakral/DullyPDF');
  });

  it('resolves canonical usage docs metadata by page key', () => {
    const metadata = resolveRouteSeo({ kind: 'usage-docs', pageKey: 'search-fill' });
    expect(metadata.canonicalPath).toBe('/usage-docs/search-fill');
    expect(metadata.title).toContain('Search & Fill');
  });

  it('resolves dedicated Create Group docs metadata', () => {
    const metadata = resolveRouteSeo({ kind: 'usage-docs', pageKey: 'create-group' });
    expect(metadata.canonicalPath).toBe('/usage-docs/create-group');
    expect(metadata.title).toContain('Create Group');
  });

  it('resolves dedicated signature docs metadata', () => {
    const metadata = resolveRouteSeo({ kind: 'usage-docs', pageKey: 'signature-workflow' });
    expect(metadata.canonicalPath).toBe('/usage-docs/signature-workflow');
    expect(metadata.title).toContain('Signature');
  });

  it('resolves dedicated API Fill docs metadata', () => {
    const metadata = resolveRouteSeo({ kind: 'usage-docs', pageKey: 'api-fill' });
    expect(metadata.canonicalPath).toBe('/usage-docs/api-fill');
    expect(metadata.title).toContain('API Fill');
  });

  it('resolves canonical intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'healthcare-pdf-automation' });
    expect(metadata.canonicalPath).toBe('/healthcare-pdf-automation');
    expect(metadata.title).toContain('Healthcare');
  });

  it('resolves form catalog intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'pdf-form-catalog' });
    expect(metadata.canonicalPath).toBe('/pdf-form-catalog');
    expect(metadata.title).toContain('Form Catalog');
  });

  it('adds item list and how-to schema for catalog-backed industry routes', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'healthcare-pdf-automation' });

    expect(
      metadata.structuredData?.some((entry) => entry['@type'] === 'ItemList'),
    ).toBe(true);
    expect(
      metadata.structuredData?.some((entry) => entry['@type'] === 'HowTo'),
    ).toBe(true);

    const itemList = metadata.structuredData?.find((entry) => entry['@type'] === 'ItemList');
    expect(itemList?.numberOfItems).toBe(10);
  });

  it('resolves signature workflow intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'pdf-signature-workflow' });
    expect(metadata.canonicalPath).toBe('/pdf-signature-workflow');
    expect(metadata.title).toContain('Signature');
  });

  it('resolves E-SIGN and UETA signing intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'esign-ueta-pdf-workflow' });
    expect(metadata.canonicalPath).toBe('/esign-ueta-pdf-workflow');
    expect(metadata.title).toContain('E-SIGN');
  });

  it('resolves API Fill intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'pdf-fill-api' });
    expect(metadata.canonicalPath).toBe('/pdf-fill-api');
    expect(metadata.title).toContain('API');
  });

  it('uses the hero copy for intent titles and appends breadcrumb schema', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'fill-pdf-from-csv' });
    expect(metadata.title).toBe('Fill PDF From CSV, SQL, Excel, or JSON Data | DullyPDF');
    expect(
      metadata.structuredData?.some(
        (entry) => entry['@type'] === 'BreadcrumbList',
      ),
    ).toBe(true);
  });

  it('resolves canonical hub metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent-hub', hubKey: 'workflows' });
    expect(metadata.canonicalPath).toBe('/workflows');
    expect(metadata.title).toBe('PDF Automation Workflows — Templates, Filling, Signing, and API');
    expect(
      metadata.structuredData?.some((entry) => entry['@type'] === 'CollectionPage'),
    ).toBe(true);
  });

  it('resolves feature plan metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'feature-plan', planKey: 'premium-features' });
    expect(metadata.canonicalPath).toBe('/premium-features');
    expect(metadata.title).toContain('Premium');
  });

  it('adds article structured data to usage docs pages that do not have faq schema', () => {
    const metadata = resolveRouteSeo({ kind: 'usage-docs', pageKey: 'editor-workflow' });
    expect(
      metadata.structuredData?.some((entry) => entry['@type'] === 'TechArticle'),
    ).toBe(true);
    const articleEntry = metadata.structuredData?.find((entry) => entry['@type'] === 'TechArticle');
    expect(articleEntry?.publisher).toMatchObject({
      '@type': 'Organization',
      name: 'DullyPDF',
    });
    expect(articleEntry?.publisher?.sameAs).toContain('https://www.youtube.com/@DullyPDF');
  });

  it('keeps build-time static routes aligned with the runtime indexable route list', () => {
    const runtimePaths = [...INDEXABLE_PUBLIC_ROUTE_PATHS].sort();
    const staticPaths = ALL_ROUTES.map((route) => route.path).sort();
    expect(staticPaths).toEqual(runtimePaths);
  });

  it('keeps build-time intent content aligned with the runtime intent page config', () => {
    const runtimeIntentPages = getIntentPages().map((page) => JSON.parse(JSON.stringify(page)));
    const staticIntentPages = STATIC_INTENT_PAGES.map((page) => JSON.parse(JSON.stringify(page)));
    expect(staticIntentPages).toEqual(runtimeIntentPages);
  });

  it('keeps build-time blog content aligned with the runtime blog post config', () => {
    const runtimeBlogPosts = getBlogPosts().map((post) => JSON.parse(JSON.stringify(post)));
    const staticBlogPosts = STATIC_BLOG_POSTS.map((post) => JSON.parse(JSON.stringify(post)));
    expect(staticBlogPosts).toEqual(runtimeBlogPosts);
  });

  it('keeps build-time feature plan content aligned with the runtime feature plan config', () => {
    const runtimeFeaturePlans = getFeaturePlanPages().map((page) => JSON.parse(JSON.stringify(page)));
    const staticFeaturePlans = STATIC_FEATURE_PLAN_PAGES.map((page) => JSON.parse(JSON.stringify(page)));
    expect(staticFeaturePlans).toEqual(runtimeFeaturePlans);
  });

  it('keeps build-time usage docs metadata aligned with the runtime docs config', () => {
    const runtimeDocsMetadata = getUsageDocsPages().map((page) => ({
      key: page.key,
      slug: page.slug,
      navLabel: page.navLabel,
      title: page.title,
      summary: page.summary,
      relatedWorkflowKeys: page.relatedWorkflowKeys ?? [],
    }));
    const staticDocsMetadata = STATIC_USAGE_DOCS_PAGES.map((page) => ({
      key: page.key,
      slug: page.slug,
      navLabel: page.navLabel,
      title: page.title,
      summary: page.summary,
      relatedWorkflowKeys: page.relatedWorkflowKeys ?? [],
    }));
    expect(staticDocsMetadata).toEqual(runtimeDocsMetadata);
  });

  it('keeps form-catalog form page titles at or under 60 characters', () => {
    // Google truncates <title> around 60 chars / 600px. Form-catalog form
    // pages are auto-generated from the official form title (often 100+
    // chars), so publicRouteSeoData.mjs drops the "— Free Fillable PDF"
    // suffix and truncates the title at a word boundary when needed. If this
    // assertion starts failing, a new form entry is pushing past the budget —
    // either shorten the entry.title or set entry.seoShortTitle.
    const overBudget = ALL_ROUTES
      .filter((route) => route.kind === 'form-catalog-form')
      .filter((route) => route.seo.title.length > 60);
    expect(overBudget).toEqual([]);
  });

  it('keeps form-catalog form page meta descriptions at or under 155 characters', () => {
    // Google truncates <meta description> around 155 chars on desktop. Every
    // form page's description is built in publicRouteSeoData.mjs by appending
    // a shared CTA to the per-form lead; buildFormCatalogMetaDescription
    // truncates the lead at a word boundary when the concatenation would
    // overflow. If this starts failing, a new entry.description is long
    // enough to leave no room for the CTA — shorten the entry.description
    // or tighten FORM_CATALOG_DESCRIPTION_CTA.
    const overBudget = ALL_ROUTES
      .filter((route) => route.kind === 'form-catalog-form')
      .filter((route) => route.seo.description.length > 155);
    expect(overBudget).toEqual([]);
  });

  it('emits complete breadcrumb item URLs for every JSON-LD breadcrumb', () => {
    const invalidBreadcrumbItems = ALL_ROUTES.flatMap((route) => (
      route.seo.structuredData ?? []
    )
      .filter((entry) => entry['@type'] === 'BreadcrumbList')
      .flatMap((entry) => (entry.itemListElement ?? []).map((item) => ({
        routePath: route.path,
        item,
      }))))
      .filter(({ item }) => (
        typeof item.item !== 'string'
        || !item.item.startsWith('https://dullypdf.com/')
      ));

    expect(invalidBreadcrumbItems).toEqual([]);
  });

  it('uses timezone-qualified upload dates for VideoObject structured data', () => {
    const videoObjects = ALL_ROUTES.flatMap((route) => (
      route.seo.structuredData ?? []
    )
      .filter((entry) => entry['@type'] === 'VideoObject')
      .map((entry) => ({
        routePath: route.path,
        uploadDate: entry.uploadDate,
      })));
    const invalidVideoDates = videoObjects.filter(({ uploadDate }) => (
      typeof uploadDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(uploadDate)
      || Number.isNaN(Date.parse(uploadDate))
    ));

    expect(videoObjects.length).toBeGreaterThan(0);
    expect(invalidVideoDates).toEqual([]);
  });

  it('adds blog article and breadcrumb structured data with the modified date', () => {
    const post = getBlogPost('auto-fill-pdf-from-spreadsheet');
    expect(post).toBeTruthy();
    const metadata = getBlogPostSeo(post!);
    expect(
      metadata.structuredData?.some(
        (entry) => entry['@type'] === 'BlogPosting' && entry['dateModified'] === '2026-04-08',
      ),
    ).toBe(true);
    expect(
      metadata.structuredData?.some((entry) => entry['@type'] === 'BreadcrumbList'),
    ).toBe(true);
  });
});
