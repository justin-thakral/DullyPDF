import { describe, expect, it } from 'vitest';
import { getStableSourceLabel, getStableSourceUrl } from '../../../src/config/stableSourceUrl.mjs';

describe('stableSourceUrl', () => {
  it('keeps predictable USCIS and VA per-form routes', () => {
    expect(getStableSourceUrl({
      sourceUrl: 'https://www.uscis.gov/sites/default/files/document/forms/i-130.pdf',
      formNumber: 'I-130',
    })).toBe('https://www.uscis.gov/i-130');

    expect(getStableSourceUrl({
      sourceUrl: 'https://www.va.gov/vaforms/medical/pdf/10-0103-fill.pdf',
      formNumber: 'VA 10-0103',
    })).toBe('https://www.va.gov/find-forms/about-form-10-0103/');
  });

  it('falls back to safe agency hubs for hosts without reliable per-form slugs', () => {
    expect(getStableSourceUrl({
      sourceUrl: 'https://www.cbp.gov/sites/default/files/2024-05/cbp_form_19.pdf',
      formNumber: 'CBP 19',
    })).toBe('https://www.cbp.gov/newsroom/publications/forms');

    expect(getStableSourceUrl({
      sourceUrl: 'https://www.sba.gov/sites/default/files/files/SBA%20Form%202289_3.pdf',
      formNumber: 'SBA Form 2289',
    })).toBe('https://www.sba.gov/document');
  });

  it('leaves unrelated hosts untouched and derives host labels from the final URL', () => {
    expect(getStableSourceUrl({
      sourceUrl: 'https://www.irs.gov/pub/irs-pdf/f1040.pdf',
      formNumber: '1040',
    })).toBe('https://www.irs.gov/pub/irs-pdf/f1040.pdf');

    expect(getStableSourceLabel('https://www.uscis.gov/i-130')).toBe('uscis.gov');
  });
});
