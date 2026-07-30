import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/config/formCatalogData.mjs', () => {
  const entries = [
    {
      slug: 'w-9',
      formNumber: 'W-9',
      title: 'Request for Taxpayer Identification Number',
      section: 'hr_onboarding',
      sourceSection: 'hr_onboarding',
      filename: 'w-9__fw9.pdf',
      year: null,
      isPriorYear: false,
      sourceUrl: 'https://www.irs.gov/pub/irs-pdf/fw9.pdf',
      bytes: 140000,
      sha256: 'a'.repeat(64),
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

  it('renders the India homepage shell with localized copy', () => {
    const html = renderPublicRouteHtml({ kind: 'home', market: 'india' });

    expect(countH1Tags(html)).toBe(1);
    expect(html).toContain('India PDF Form Automation for KYC, Vendor, HR, and Invoice Workflows');
    expect(html).toContain('PAN, GSTIN, vendor codes');
    expect(html).not.toMatch(/Pre-Made Form Catalog|Form Catalog|e-?sign|signature|UETA/i);
  });

  it('renders the Spanish homepage shell with localized copy', () => {
    const html = renderPublicRouteHtml({ kind: 'home', market: 'spanish' });

    expect(countH1Tags(html)).toBe(1);
    expect(html).toContain('Crear formularios PDF rellenables con IA');
    expect(html).toContain('Ver la documentación de uso');
    expect(html).toContain('Generador de formularios PDF');
    expect(html).not.toMatch(/Pre-Made Form Catalog|Form Catalog|\bE-SIGN\b|\bUETA\b|\bsignature\b|\be-signature\b|\be-sign\b|\bfirma\b|\bfirmar\b|\bfirmas\b/i);
  });

  it('renders the India blog guide as static public HTML', () => {
    const html = renderPublicRouteHtml({
      kind: 'blog-post',
      slug: 'india-pdf-form-automation-guide',
      locale: 'in',
    });

    expect(countH1Tags(html)).toBe(1);
    const footerHtml = html.match(/<footer[\s\S]*<\/footer>/)?.[0] ?? '';

    expect(html).toContain('PDF Form Automation in India: KYC, Vendor, HR, GST, and Branch Workflows');
    expect(html).toContain('Start with one India document family');
    expect(html).toContain('/in/fill-pdf-from-excel');
    expect(footerHtml).toContain('/in/blog');
    expect(footerHtml).not.toContain('/es/blog');
    expect(footerHtml).not.toMatch(/India/i);
    expect(html).not.toMatch(/Form Catalog|ACORD|\bIRS\b|W-9|1099|W-8|Medicare|Medicaid|HIPAA|E-SIGN|UETA|United States|U\.S\./i);
  });

  it('renders form catalog detail pages with a single h1', () => {
    const html = renderPublicRouteHtml({ kind: 'form-catalog-form', slug: 'w-9' });

    expect(countH1Tags(html)).toBe(1);
    expect(html).toMatch(/<h1 class="form-catalog__hero-title">W-9 — .*Request for Taxpayer Identification Number<\/h1>/);
    expect(html).toContain('<p class="form-catalog-detail__meta-title">Request for Taxpayer Identification Number</p>');
    expect(html).toContain('class="form-catalog-detail__preview-image"');
    expect(html).toContain('src="/form-catalog-assets/hr_onboarding/w-9__fw9.webp"');
    expect(html).toContain('alt="W-9 fillable PDF first-page preview of Request for Taxpayer Identification Number"');
    expect(html).toContain('data-form-catalog-source-section="hr_onboarding"');
    expect(html).toContain('data-form-catalog-filename="w-9__fw9.pdf"');
    expect(html).toContain('data-form-catalog-sha256="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"');
    expect(html).toContain(
      'data-form-catalog-pdf-url="/form-catalog-assets/hr_onboarding/w-9__fw9.pdf"',
    );
  });
});
