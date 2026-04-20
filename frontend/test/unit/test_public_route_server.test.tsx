import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/formCatalogData.mjs', () => {
  const entries = [
    {
      slug: 'w-9',
      formNumber: 'W-9',
      title: 'Request for Taxpayer Identification Number',
      section: 'hr_onboarding',
      filename: 'w-9__fw9.pdf',
      year: null,
      isPriorYear: false,
      sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
      bytes: 140000,
      sha256: null,
      pageCount: 6,
      pdfUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.pdf',
      thumbnailUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.webp',
      description: 'Use Form W-9 to request a taxpayer identification number.',
      useCase: '',
    },
  ];
  const bySlug = Object.fromEntries(entries.map((entry) => [entry.slug, entry]));
  return {
    FORM_CATALOG_ASSET_BASE: '/form-catalog-assets',
    FORM_CATALOG_ENTRIES: entries,
    FORM_CATALOG_BY_SLUG: bySlug,
    getFormCatalogEntryBySlug: (slug: string) => bySlug[slug] || null,
  };
});

vi.mock('../../src/config/formCatalogCategories.mjs', () => ({
  FORM_CATALOG_CATEGORIES: [
    {
      key: 'hr_onboarding',
      label: 'HR & Onboarding',
      sections: ['hr_onboarding'],
      count: 1,
      empty: false,
      emptyReason: null,
    },
  ],
  FORM_CATALOG_TOTAL_COUNT: 1,
}));

vi.mock('../../src/config/formCatalogExternalSources.mjs', () => ({
  FORM_CATALOG_EXTERNAL_SOURCES: {},
}));

import { renderPublicRouteHtml } from '../../src/publicRouteServer';

function countH1Tags(html: string): number {
  return html.match(/<h1\b/g)?.length ?? 0;
}

describe('renderPublicRouteHtml', () => {
  it('renders the homepage shell with a single h1', () => {
    const html = renderPublicRouteHtml({ kind: 'home' });

    expect(countH1Tags(html)).toBe(1);
    expect(html).toContain('<div class="header-title">PDF Form Generator</div>');
    expect(html).toContain('<h1 class="homepage-main-title">');
  });

  it('renders form catalog detail pages with a single h1', () => {
    const html = renderPublicRouteHtml({ kind: 'form-catalog-form', slug: 'w-9' });

    expect(countH1Tags(html)).toBe(1);
    expect(html).toMatch(/<h1 class="form-catalog__hero-title">W-9 — .*Request for Taxpayer Identification Number<\/h1>/);
    expect(html).toContain('<p class="form-catalog-detail__meta-title">Request for Taxpayer Identification Number</p>');
  });
});
