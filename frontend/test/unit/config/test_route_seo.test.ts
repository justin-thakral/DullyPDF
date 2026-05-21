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

  it('resolves canonical refund policy metadata', () => {
    const metadata = resolveRouteSeo({ kind: 'legal', legalKind: 'refund' });
    expect(metadata.canonicalPath).toBe('/refund-policy');
    expect(metadata.title).toBe('Refund and Return Policy | DullyPDF');
    expect(metadata.keywords).toContain('dullypdf refund policy');
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

  it('resolves advanced image and barcode field intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'pdf-image-qr-barcode-fields' });
    expect(metadata.canonicalPath).toBe('/pdf-field-types/image-qr-barcode-fields');
    expect(metadata.title).toBe('PDF Image, QR Code, PDF417 & 1D Barcode Fields | DullyPDF');
    expect(metadata.keywords).toContain('add image field to pdf');
    expect(metadata.ogImagePath).toBe('/seo/advanced-pdf-fields-overview.webp');
  });

  it('resolves add image field intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'add-image-field-to-pdf' });
    expect(metadata.canonicalPath).toBe('/add-image-field-to-pdf');
    expect(metadata.title).toBe('Add Image Fields to Fillable PDFs Online | DullyPDF');
    expect(metadata.keywords).toContain('pdf form image upload field');
    expect(metadata.ogImagePath).toBe('/seo/add-image-field-to-pdf-overview.webp');
  });

  it('resolves add QR code field intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'add-qr-code-field-to-pdf' });
    expect(metadata.canonicalPath).toBe('/add-qr-code-field-to-pdf');
    expect(metadata.title).toBe('Add QR Code Fields to Fillable PDFs | DullyPDF');
    expect(metadata.keywords).toContain('qr code pdf form field');
    expect(metadata.ogImagePath).toBe('/seo/add-qr-code-field-to-pdf-overview.webp');
  });

  it('resolves remaining image and barcode field intent metadata by key', () => {
    const cases = [
      {
        intentKey: 'add-pdf417-barcode-field-to-pdf',
        canonicalPath: '/add-pdf417-barcode-field-to-pdf',
        title: 'Add PDF417 Barcode Fields to Fillable PDFs | DullyPDF',
        keyword: 'pdf417 barcode field pdf',
        ogImagePath: '/seo/add-pdf417-barcode-field-to-pdf-overview.webp',
      },
      {
        intentKey: 'add-1d-barcode-field-to-pdf',
        canonicalPath: '/add-1d-barcode-field-to-pdf',
        title: 'Add 1D Barcode Fields to Fillable PDFs | DullyPDF',
        keyword: '1d barcode pdf form field',
        ogImagePath: '/seo/add-1d-barcode-field-to-pdf-overview.webp',
      },
      {
        intentKey: 'add-barcode-to-pdf-form',
        canonicalPath: '/add-barcode-to-pdf-form',
        title: 'Add a Barcode to a PDF Form Online | DullyPDF',
        keyword: 'add barcode to pdf form',
        ogImagePath: '/seo/add-barcode-to-pdf-form-overview.webp',
      },
      {
        intentKey: 'pdf417-vs-qr-code-pdf-forms',
        canonicalPath: '/pdf417-vs-qr-code-pdf-forms',
        title: 'PDF417 vs QR Code for PDF Forms | DullyPDF',
        keyword: 'pdf417 vs qr code pdf forms',
        ogImagePath: '/seo/pdf417-vs-qr-code-pdf-forms-overview.webp',
      },
      {
        intentKey: 'generate-pdf-barcodes-from-csv',
        canonicalPath: '/generate-pdf-barcodes-from-csv',
        title: 'Generate PDF Barcodes From CSV or Database Fields | DullyPDF',
        keyword: 'generate pdf barcodes from csv',
        ogImagePath: '/seo/generate-pdf-barcodes-from-csv-overview.webp',
      },
      {
        intentKey: 'image-upload-fields-pdf-forms',
        canonicalPath: '/image-upload-fields-pdf-forms',
        title: 'Image Upload Fields in PDF Forms | DullyPDF',
        keyword: 'image upload fields pdf forms',
        ogImagePath: '/seo/image-upload-fields-pdf-forms-overview.webp',
      },
    ] as const;

    cases.forEach(({ intentKey, canonicalPath, title, keyword, ogImagePath }) => {
      const metadata = resolveRouteSeo({ kind: 'intent', intentKey });
      expect(metadata.canonicalPath).toBe(canonicalPath);
      expect(metadata.title).toBe(title);
      expect(metadata.keywords).toContain(keyword);
      expect(metadata.ogImagePath).toBe(ogImagePath);
    });
  });

  it('resolves high-value image and barcode long-tail intent metadata by key', () => {
    const cases = [
      {
        intentKey: 'add-code-128-barcode-to-pdf',
        canonicalPath: '/add-code-128-barcode-to-pdf',
        title: 'Add Code 128 Barcodes to PDF Forms | DullyPDF',
        keyword: 'code 128 pdf barcode',
        ogImagePath: '/seo/add-code-128-barcode-to-pdf-overview.webp',
      },
      {
        intentKey: 'work-order-barcode-pdf',
        canonicalPath: '/work-order-barcode-pdf',
        title: 'Add Barcodes to Work Order PDFs | DullyPDF',
        keyword: 'work order barcode pdf',
        ogImagePath: '/seo/work-order-barcode-pdf-overview.webp',
      },
      {
        intentKey: 'asset-tag-barcode-pdf-form',
        canonicalPath: '/asset-tag-barcode-pdf-form',
        title: 'Add Asset Tag Barcodes to PDF Forms | DullyPDF',
        keyword: 'asset tag barcode pdf form',
        ogImagePath: '/seo/asset-tag-barcode-pdf-form-overview.webp',
      },
      {
        intentKey: 'qr-code-verification-pdf',
        canonicalPath: '/qr-code-verification-pdf',
        title: 'Add QR Code Verification Links to PDFs | DullyPDF',
        keyword: 'qr code verification pdf',
        ogImagePath: '/seo/qr-code-verification-pdf-overview.webp',
      },
      {
        intentKey: 'qr-code-payment-link-pdf',
        canonicalPath: '/qr-code-payment-link-pdf',
        title: 'Add Payment QR Codes to PDF Invoices | DullyPDF',
        keyword: 'qr code payment link pdf',
        ogImagePath: '/seo/qr-code-payment-link-pdf-overview.webp',
      },
      {
        intentKey: 'qr-code-record-lookup-pdf',
        canonicalPath: '/qr-code-record-lookup-pdf',
        title: 'Add Record Lookup QR Codes to PDFs | DullyPDF',
        keyword: 'qr code record lookup pdf',
        ogImagePath: '/seo/qr-code-record-lookup-pdf-overview.webp',
      },
      {
        intentKey: 'scannable-pdf-form',
        canonicalPath: '/scannable-pdf-form',
        title: 'Create Scannable PDF Forms With QR and Barcode Fields | DullyPDF',
        keyword: 'scannable pdf form',
        ogImagePath: '/seo/scannable-pdf-form-overview.webp',
      },
      {
        intentKey: 'pdf-photo-upload-field',
        canonicalPath: '/pdf-photo-upload-field',
        title: 'Add Photo Upload Fields to PDF Forms | DullyPDF',
        keyword: 'pdf photo upload field',
        ogImagePath: '/seo/pdf-photo-upload-field-overview.webp',
      },
      {
        intentKey: 'id-photo-field-pdf-form',
        canonicalPath: '/id-photo-field-pdf-form',
        title: 'Add ID Photo Fields to PDF Forms | DullyPDF',
        keyword: 'id photo field pdf form',
        ogImagePath: '/seo/id-photo-field-pdf-form-overview.webp',
      },
      {
        intentKey: 'receipt-upload-field-pdf-form',
        canonicalPath: '/receipt-upload-field-pdf-form',
        title: 'Add Receipt Upload Fields to PDF Forms | DullyPDF',
        keyword: 'receipt upload field pdf form',
        ogImagePath: '/seo/receipt-upload-field-pdf-form-overview.webp',
      },
    ] as const;

    cases.forEach(({ intentKey, canonicalPath, title, keyword, ogImagePath }) => {
      const metadata = resolveRouteSeo({ kind: 'intent', intentKey });
      expect(metadata.canonicalPath).toBe(canonicalPath);
      expect(metadata.title).toBe(title);
      expect(metadata.keywords).toContain(keyword);
      expect(metadata.ogImagePath).toBe(ogImagePath);
    });
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

  it('resolves customizable industry intent metadata by key', () => {
    const cases = [
      {
        intentKey: 'manufacturing-pdf-automation',
        canonicalPath: '/manufacturing-pdf-automation',
        title: 'Manufacturing PDF Automation for Quality, Work Orders, and Lot Records | DullyPDF',
        keyword: 'manufacturing pdf automation',
        ogImagePath: '/seo/manufacturing-pdf-automation-overview.webp',
      },
      {
        intentKey: 'field-service-pdf-automation',
        canonicalPath: '/field-service-pdf-automation',
        title: 'Field Service PDF Automation for Work Orders, Assets, and Service Totals | DullyPDF',
        keyword: 'field service pdf automation',
        ogImagePath: '/seo/field-service-pdf-automation-overview.webp',
      },
      {
        intentKey: 'warehouse-inventory-pdf-automation',
        canonicalPath: '/warehouse-inventory-pdf-automation',
        title: 'Warehouse Inventory PDF Automation for Counts, Barcodes, and Variance Forms | DullyPDF',
        keyword: 'warehouse inventory pdf automation',
        ogImagePath: '/seo/warehouse-inventory-pdf-automation-overview.webp',
      },
      {
        intentKey: 'procurement-pdf-automation',
        canonicalPath: '/procurement-pdf-automation',
        title: 'Procurement PDF Automation for Purchase Orders, Vendor Forms, and Approvals | DullyPDF',
        keyword: 'procurement pdf automation',
        ogImagePath: '/seo/procurement-pdf-automation-overview.webp',
      },
      {
        intentKey: 'utilities-energy-pdf-automation',
        canonicalPath: '/utilities-energy-pdf-automation',
        title: 'Utilities and Energy PDF Automation for Meter, Asset, and Service Forms | DullyPDF',
        keyword: 'utilities pdf automation',
        ogImagePath: '/seo/utilities-energy-pdf-automation-overview.webp',
      },
    ] as const;

    cases.forEach(({ intentKey, canonicalPath, title, keyword, ogImagePath }) => {
      const metadata = resolveRouteSeo({ kind: 'intent', intentKey });
      expect(metadata.canonicalPath).toBe(canonicalPath);
      expect(metadata.title).toBe(title);
      expect(metadata.keywords).toContain(keyword);
      expect(metadata.ogImagePath).toBe(ogImagePath);
    });
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
    expect((metadata as { video?: unknown }).video).toBeUndefined();
    expect(metadata.structuredData?.some((entry) => entry['@type'] === 'VideoObject')).toBe(false);
  });

  it('resolves PDF calculation fields intent metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'pdf-calculation-fields' });
    expect(metadata.canonicalPath).toBe('/pdf-calculation-fields');
    expect(metadata.title).toBe('Create PDF Calculation Fields Without JavaScript | DullyPDF');
    expect(metadata.keywords).toContain('calculated fields pdf form');
    expect(metadata.ogImagePath).toBe('/seo/calculation-fields-overview.webp');
  });

  it('resolves the calculation SEO cluster metadata by key', () => {
    const calculationRoutes = [
      ['pdf-form-calculations-not-working', '/pdf-form-calculations-not-working', 'pdf form calculations not working'],
      ['add-calculated-field-to-pdf', '/add-calculated-field-to-pdf', 'add calculated field to pdf'],
      ['fillable-pdf-total-field', '/fillable-pdf-total-field', 'fillable pdf total field'],
      ['api-fill-calculated-pdf', '/api-fill-calculated-pdf', 'api fill calculated pdf'],
      ['pdf-form-javascript-calculation-alternative', '/pdf-form-javascript-calculation-alternative', 'acrobat javascript calculation alternative'],
      ['pdf-calculation-order', '/pdf-calculation-order', 'pdf calculation order'],
      ['pdf-invoice-calculation-template', '/pdf-invoice-calculation-template', 'pdf invoice calculation template'],
      ['pdf-order-form-calculations', '/pdf-order-form-calculations', 'pdf order form calculations'],
      ['pdf-estimate-quote-calculations', '/pdf-estimate-quote-calculations', 'pdf estimate calculation template'],
      ['calculated-pdf-from-csv', '/calculated-pdf-from-csv', 'calculated pdf from csv'],
      ['fill-by-link-calculated-pdf', '/fill-by-link-calculated-pdf', 'fill by link calculated pdf'],
      ['flat-vs-editable-calculated-pdf', '/flat-vs-editable-calculated-pdf', 'flat vs editable calculated pdf'],
      ['pdf-expense-report-calculations', '/pdf-expense-report-calculations', 'pdf expense report calculations'],
      ['pdf-timesheet-calculations', '/pdf-timesheet-calculations', 'pdf timesheet calculations'],
      ['pdf-purchase-order-calculations', '/pdf-purchase-order-calculations', 'pdf purchase order calculations'],
      ['pdf-construction-bid-calculations', '/pdf-construction-bid-calculations', 'pdf construction bid calculations'],
      ['pdf-change-order-calculations', '/pdf-change-order-calculations', 'pdf change order calculations'],
      ['pdf-mileage-reimbursement-calculation', '/pdf-mileage-reimbursement-calculation', 'pdf mileage reimbursement calculation'],
      ['pdf-inspection-score-calculations', '/pdf-inspection-score-calculations', 'pdf inspection score calculations'],
    ] as const;

    calculationRoutes.forEach(([intentKey, canonicalPath, keyword]) => {
      const metadata = resolveRouteSeo({ kind: 'intent', intentKey });
      expect(metadata.canonicalPath).toBe(canonicalPath);
      expect(metadata.keywords).toContain(keyword);
      expect(metadata.structuredData?.some((entry) => entry['@type'] === 'BreadcrumbList')).toBe(true);
    });
  });

  it('resolves the DullyPDF highlight SEO cluster metadata by key', () => {
    const highlightRoutes = [
      ['ai-pdf-field-renaming', '/ai-pdf-field-renaming', 'ai pdf field renaming'],
      ['fill-pdf-from-image', '/fill-pdf-from-image', 'fill pdf from image'],
      ['save-reusable-pdf-template', '/save-reusable-pdf-template', 'save reusable pdf template'],
      ['pdf-packet-workflow', '/pdf-packet-workflow', 'pdf packet workflow'],
      ['merge-fillable-pdf-forms', '/merge-fillable-pdf-forms', 'merge fillable pdf forms'],
      ['reorder-fillable-pdf-pages', '/reorder-fillable-pdf-pages', 'reorder fillable pdf pages'],
      ['rotate-fillable-pdf-pages', '/rotate-fillable-pdf-pages', 'rotate fillable pdf pages'],
      ['split-fillable-pdf-forms', '/split-fillable-pdf-forms', 'split fillable pdf forms'],
      ['delete-pages-from-fillable-pdf', '/delete-pages-from-fillable-pdf', 'delete pages from fillable pdf'],
      ['compress-fillable-pdf-forms', '/compress-fillable-pdf-forms', 'compress fillable pdf forms'],
      ['fill-pdf-link-signature', '/fill-pdf-link-signature', 'web form to signed pdf'],
      ['pdf-signature-audit-trail', '/pdf-signature-audit-trail', 'pdf signature audit trail'],
      ['flat-vs-editable-pdf', '/flat-vs-editable-pdf', 'flat vs editable pdf'],
      ['search-fill-pdf-review', '/search-fill-pdf-review', 'search and fill pdf'],
      ['openai-pdf-data-privacy', '/openai-pdf-data-privacy', 'openai pdf data privacy'],
      ['mobile-fillable-pdf-form', '/mobile-fillable-pdf-form', 'mobile pdf form'],
      ['stored-fill-by-link-responses', '/stored-fill-by-link-responses', 'stored pdf form responses'],
      ['group-api-fill-zip-packet', '/group-api-fill-zip-packet', 'pdf packet api'],
      ['batch-rename-map-pdf-group', '/batch-rename-map-pdf-group', 'batch rename pdf fields'],
      ['verify-signed-pdf', '/verify-signed-pdf', 'verify signed pdf online'],
      ['no-code-pdf-automation', '/no-code-pdf-automation', 'no code pdf automation'],
    ] as const;

    highlightRoutes.forEach(([intentKey, canonicalPath, keyword]) => {
      const metadata = resolveRouteSeo({ kind: 'intent', intentKey });
      expect(metadata.canonicalPath).toBe(canonicalPath);
      expect(metadata.keywords).toContain(keyword);
      expect(metadata.structuredData?.some((entry) => entry['@type'] === 'BreadcrumbList')).toBe(true);
      expect(metadata.ogImagePath).toBeTruthy();
    });
  });

  it('resolves merge fillable PDF forms metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'merge-fillable-pdf-forms' });

    expect(metadata.canonicalPath).toBe('/merge-fillable-pdf-forms');
    expect(metadata.title).toBe('Merge Fillable PDF Forms Safely | DullyPDF');
    expect(metadata.keywords).toContain('merge pdf forms without losing fields');
    expect(metadata.ogImagePath).toBe('/seo/merge-fillable-pdf-forms-overview.webp');
  });

  it('resolves reorder fillable PDF pages metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'reorder-fillable-pdf-pages' });

    expect(metadata.canonicalPath).toBe('/reorder-fillable-pdf-pages');
    expect(metadata.title).toBe('Reorder Fillable PDF Pages Safely | DullyPDF');
    expect(metadata.keywords).toContain('reorder pdf pages with form fields');
    expect(metadata.ogImagePath).toBe('/seo/reorder-fillable-pdf-pages-overview.webp');
  });

  it('resolves rotate fillable PDF pages metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'rotate-fillable-pdf-pages' });

    expect(metadata.canonicalPath).toBe('/rotate-fillable-pdf-pages');
    expect(metadata.title).toBe('Rotate Fillable PDF Pages Safely | DullyPDF');
    expect(metadata.keywords).toContain('rotate pdf without losing fields');
    expect(metadata.ogImagePath).toBeTruthy();
  });

  it('resolves split fillable PDF forms metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'split-fillable-pdf-forms' });

    expect(metadata.canonicalPath).toBe('/split-fillable-pdf-forms');
    expect(metadata.title).toBe('Split Fillable PDF Forms Safely | DullyPDF');
    expect(metadata.keywords).toContain('split pdf form without losing fields');
    expect(metadata.ogImagePath).toBe('/seo/split-fillable-pdf-forms-overview.webp');
  });

  it('resolves delete pages from fillable PDF metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'delete-pages-from-fillable-pdf' });

    expect(metadata.canonicalPath).toBe('/delete-pages-from-fillable-pdf');
    expect(metadata.title).toBe('Delete Pages From Fillable PDFs Safely | DullyPDF');
    expect(metadata.keywords).toContain('delete pages without losing pdf fields');
    expect(metadata.ogImagePath).toBe('/seo/delete-pages-from-fillable-pdf-overview.webp');
  });

  it('resolves compress fillable PDF forms metadata by key', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'compress-fillable-pdf-forms' });

    expect(metadata.canonicalPath).toBe('/compress-fillable-pdf-forms');
    expect(metadata.title).toBe('Compress Fillable PDF Forms Safely | DullyPDF');
    expect(metadata.keywords).toContain('compress pdf without losing fields');
    expect(metadata.ogImagePath).toBe('/seo/compress-fillable-pdf-forms-overview.webp');
  });

  it('uses the hero copy for intent titles and appends breadcrumb schema', () => {
    const metadata = resolveRouteSeo({ kind: 'intent', intentKey: 'fill-pdf-from-csv' });
    expect(metadata.title).toBe('Fill PDF From CSV, Excel, or JSON Data | DullyPDF');
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
