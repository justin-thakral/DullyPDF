import { describe, expect, it } from 'vitest';
import {
  getIntentPageArticleFigures,
  getIntentPage,
  getIntentPages,
  resolveIntentPath,
} from '../../../src/config/intentPages';
import { HIGH_INTENT_OPPORTUNITY_PAGES } from '../../../src/config/highIntentOpportunityPages.mjs';

describe('intentPages config', () => {
  it('keeps intent paths unique', () => {
    const paths = getIntentPages().map((page) => page.path);
    const unique = new Set(paths);
    expect(unique.size).toBe(paths.length);
  });

  it('resolves canonical intent routes', () => {
    expect(resolveIntentPath('/pdf-to-fillable-form')).toBe('pdf-to-fillable-form');
    expect(resolveIntentPath('/pdf-field-types/image-qr-barcode-fields')).toBe('pdf-image-qr-barcode-fields');
    expect(resolveIntentPath('/add-image-field-to-pdf')).toBe('add-image-field-to-pdf');
    expect(resolveIntentPath('/add-qr-code-field-to-pdf')).toBe('add-qr-code-field-to-pdf');
    expect(resolveIntentPath('/add-pdf417-barcode-field-to-pdf')).toBe('add-pdf417-barcode-field-to-pdf');
    expect(resolveIntentPath('/add-1d-barcode-field-to-pdf')).toBe('add-1d-barcode-field-to-pdf');
    expect(resolveIntentPath('/add-barcode-to-pdf-form')).toBe('add-barcode-to-pdf-form');
    expect(resolveIntentPath('/pdf417-vs-qr-code-pdf-forms')).toBe('pdf417-vs-qr-code-pdf-forms');
    expect(resolveIntentPath('/generate-pdf-barcodes-from-csv')).toBe('generate-pdf-barcodes-from-csv');
    expect(resolveIntentPath('/image-upload-fields-pdf-forms')).toBe('image-upload-fields-pdf-forms');
    expect(resolveIntentPath('/add-code-128-barcode-to-pdf')).toBe('add-code-128-barcode-to-pdf');
    expect(resolveIntentPath('/work-order-barcode-pdf')).toBe('work-order-barcode-pdf');
    expect(resolveIntentPath('/asset-tag-barcode-pdf-form')).toBe('asset-tag-barcode-pdf-form');
    expect(resolveIntentPath('/qr-code-verification-pdf')).toBe('qr-code-verification-pdf');
    expect(resolveIntentPath('/qr-code-payment-link-pdf')).toBe('qr-code-payment-link-pdf');
    expect(resolveIntentPath('/qr-code-record-lookup-pdf')).toBe('qr-code-record-lookup-pdf');
    expect(resolveIntentPath('/scannable-pdf-form')).toBe('scannable-pdf-form');
    expect(resolveIntentPath('/pdf-photo-upload-field')).toBe('pdf-photo-upload-field');
    expect(resolveIntentPath('/id-photo-field-pdf-form')).toBe('id-photo-field-pdf-form');
    expect(resolveIntentPath('/receipt-upload-field-pdf-form')).toBe('receipt-upload-field-pdf-form');
    expect(resolveIntentPath('/manufacturing-pdf-automation')).toBe('manufacturing-pdf-automation');
    expect(resolveIntentPath('/field-service-pdf-automation')).toBe('field-service-pdf-automation');
    expect(resolveIntentPath('/warehouse-inventory-pdf-automation')).toBe('warehouse-inventory-pdf-automation');
    expect(resolveIntentPath('/procurement-pdf-automation')).toBe('procurement-pdf-automation');
    expect(resolveIntentPath('/utilities-energy-pdf-automation')).toBe('utilities-energy-pdf-automation');
    expect(resolveIntentPath('/pdf-form-catalog')).toBe('pdf-form-catalog');
    expect(resolveIntentPath('/fillable-form-field-name/')).toBe('fillable-form-field-name');
    expect(resolveIntentPath('/pdf-signature-workflow')).toBe('pdf-signature-workflow');
    expect(resolveIntentPath('/esign-ueta-pdf-workflow')).toBe('esign-ueta-pdf-workflow');
    expect(resolveIntentPath('/pdf-fill-api')).toBe('pdf-fill-api');
    expect(resolveIntentPath('/pdf-calculation-fields')).toBe('pdf-calculation-fields');
    expect(resolveIntentPath('/pdf-form-calculations-not-working')).toBe('pdf-form-calculations-not-working');
    expect(resolveIntentPath('/add-calculated-field-to-pdf')).toBe('add-calculated-field-to-pdf');
    expect(resolveIntentPath('/fillable-pdf-total-field')).toBe('fillable-pdf-total-field');
    expect(resolveIntentPath('/api-fill-calculated-pdf')).toBe('api-fill-calculated-pdf');
    expect(resolveIntentPath('/pdf-form-javascript-calculation-alternative')).toBe('pdf-form-javascript-calculation-alternative');
    expect(resolveIntentPath('/pdf-calculation-order')).toBe('pdf-calculation-order');
    expect(resolveIntentPath('/pdf-invoice-calculation-template')).toBe('pdf-invoice-calculation-template');
    expect(resolveIntentPath('/pdf-order-form-calculations')).toBe('pdf-order-form-calculations');
    expect(resolveIntentPath('/pdf-estimate-quote-calculations')).toBe('pdf-estimate-quote-calculations');
    expect(resolveIntentPath('/calculated-pdf-from-csv')).toBe('calculated-pdf-from-csv');
    expect(resolveIntentPath('/fill-by-link-calculated-pdf')).toBe('fill-by-link-calculated-pdf');
    expect(resolveIntentPath('/flat-vs-editable-calculated-pdf')).toBe('flat-vs-editable-calculated-pdf');
    expect(resolveIntentPath('/pdf-expense-report-calculations')).toBe('pdf-expense-report-calculations');
    expect(resolveIntentPath('/pdf-timesheet-calculations')).toBe('pdf-timesheet-calculations');
    expect(resolveIntentPath('/pdf-purchase-order-calculations')).toBe('pdf-purchase-order-calculations');
    expect(resolveIntentPath('/pdf-construction-bid-calculations')).toBe('pdf-construction-bid-calculations');
    expect(resolveIntentPath('/pdf-change-order-calculations')).toBe('pdf-change-order-calculations');
    expect(resolveIntentPath('/pdf-mileage-reimbursement-calculation')).toBe('pdf-mileage-reimbursement-calculation');
    expect(resolveIntentPath('/pdf-inspection-score-calculations')).toBe('pdf-inspection-score-calculations');
    expect(resolveIntentPath('/ai-pdf-field-renaming')).toBe('ai-pdf-field-renaming');
    expect(resolveIntentPath('/fill-pdf-from-image')).toBe('fill-pdf-from-image');
    expect(resolveIntentPath('/save-reusable-pdf-template')).toBe('save-reusable-pdf-template');
    expect(resolveIntentPath('/pdf-packet-workflow')).toBe('pdf-packet-workflow');
    expect(resolveIntentPath('/merge-fillable-pdf-forms')).toBe('merge-fillable-pdf-forms');
    expect(resolveIntentPath('/reorder-fillable-pdf-pages')).toBe('reorder-fillable-pdf-pages');
    expect(resolveIntentPath('/rotate-fillable-pdf-pages')).toBe('rotate-fillable-pdf-pages');
    expect(resolveIntentPath('/split-fillable-pdf-forms')).toBe('split-fillable-pdf-forms');
    expect(resolveIntentPath('/delete-pages-from-fillable-pdf')).toBe('delete-pages-from-fillable-pdf');
    expect(resolveIntentPath('/compress-fillable-pdf-forms')).toBe('compress-fillable-pdf-forms');
    expect(resolveIntentPath('/fill-pdf-link-signature')).toBe('fill-pdf-link-signature');
    expect(resolveIntentPath('/pdf-signature-audit-trail')).toBe('pdf-signature-audit-trail');
    expect(resolveIntentPath('/flat-vs-editable-pdf')).toBe('flat-vs-editable-pdf');
    expect(resolveIntentPath('/search-fill-pdf-review')).toBe('search-fill-pdf-review');
    expect(resolveIntentPath('/openai-pdf-data-privacy')).toBe('openai-pdf-data-privacy');
    expect(resolveIntentPath('/mobile-fillable-pdf-form')).toBe('mobile-fillable-pdf-form');
    expect(resolveIntentPath('/stored-fill-by-link-responses')).toBe('stored-fill-by-link-responses');
    expect(resolveIntentPath('/group-api-fill-zip-packet')).toBe('group-api-fill-zip-packet');
    expect(resolveIntentPath('/batch-rename-map-pdf-group')).toBe('batch-rename-map-pdf-group');
    expect(resolveIntentPath('/verify-signed-pdf')).toBe('verify-signed-pdf');
    expect(resolveIntentPath('/no-code-pdf-automation')).toBe('no-code-pdf-automation');
    expect(resolveIntentPath('/pdf-radio-button-editor')).toBe('pdf-radio-button-editor');
    expect(resolveIntentPath('/healthcare-pdf-automation')).toBe('healthcare-pdf-automation');
    expect(resolveIntentPath('/acord-form-automation')).toBe('acord-form-automation');
    expect(resolveIntentPath('/es/crear-formulario-pdf-rellenable')).toBe('es-create-fillable-pdf-form');
    expect(resolveIntentPath('/es/automatizacion-pdf-salud')).toBe('es-healthcare-pdf-automation');
    expect(resolveIntentPath('/not-an-intent')).toBeNull();
  });

  it('contains SEO and FAQ data for every intent page', () => {
    getIntentPages().forEach((page) => {
      expect(page.seoTitle.length).toBeGreaterThan(10);
      expect(page.seoDescription.length).toBeGreaterThan(20);
      expect(page.seoKeywords.length).toBeGreaterThan(1);
      expect(page.faqs.length).toBeGreaterThan(0);
      expect(getIntentPage(page.key).path).toBe(page.path);
    });
  });

  it('resolves every high-intent opportunity route and keeps a unique first visual', () => {
    const firstFigureBySrc = new Map<string, string>();

    HIGH_INTENT_OPPORTUNITY_PAGES.forEach((page) => {
      expect(resolveIntentPath(page.path)).toBe(page.key);

      const figures = getIntentPageArticleFigures(page.key);
      expect(figures.length, `${page.key} should have a route-specific screenshot`).toBeGreaterThan(0);

      const firstFigure = figures[0];
      expect(firstFigure.src).toBe(`/seo/${page.key}-overview.webp`);
      expect(firstFigureBySrc.has(firstFigure.src), `${firstFigure.src} should not be shared`).toBe(false);
      firstFigureBySrc.set(firstFigure.src, page.key);
    });

    expect(HIGH_INTENT_OPPORTUNITY_PAGES.length).toBeGreaterThanOrEqual(25);
  });

  it('keeps legal footnotes on the signing authority pages', () => {
    const workflowPage = getIntentPage('pdf-signature-workflow');
    const legalPage = getIntentPage('esign-ueta-pdf-workflow');

    expect(workflowPage.footnotes?.length ?? 0).toBeGreaterThan(3);
    expect(legalPage.footnotes?.length ?? 0).toBeGreaterThan(6);
    expect(legalPage.footnotes?.some((footnote) => footnote.label.includes('21 CFR Part 11'))).toBe(true);
  });

  it('keeps industry pages article-shaped and visually grounded', () => {
    getIntentPages()
      .filter((page) => page.category === 'industry')
      .forEach((page) => {
        expect(page.articleSections?.length ?? 0, `${page.key} should have at least four article sections`).toBeGreaterThanOrEqual(4);
        expect(getIntentPageArticleFigures(page.key).length, `${page.key} should have supporting figures`).toBeGreaterThan(0);
      });
  });
});
