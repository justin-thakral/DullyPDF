import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the generated catalog data so tests are deterministic and do not have
// to load the full 1900-entry production index.
vi.mock('../../../../src/config/formCatalogData.mjs', () => {
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
      pdfUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.pdf',
      thumbnailUrl: '/form-catalog-assets/hr_onboarding/w-9__fw9.webp',
      description: 'Use Form W-9 to request a taxpayer identification number.',
      useCase: '',
    },
    {
      slug: 'i-9',
      formNumber: 'I-9',
      title: 'Employment Eligibility Verification',
      section: 'hr_onboarding',
      filename: 'i-9__i-9.pdf',
      year: null,
      isPriorYear: false,
      sourceUrl: 'https://www.uscis.gov/i-9',
      bytes: 500000,
      sha256: null,
      pdfUrl: '/form-catalog-assets/hr_onboarding/i-9__i-9.pdf',
      thumbnailUrl: '/form-catalog-assets/hr_onboarding/i-9__i-9.webp',
      description: 'Use Form I-9 to verify employment eligibility.',
      useCase: '',
    },
    {
      slug: 'cms-1500',
      formNumber: 'CMS-1500',
      title: 'Health Insurance Claim Form',
      section: 'healthcare',
      filename: 'cms-1500__cms1500.pdf',
      year: null,
      isPriorYear: false,
      sourceUrl: 'https://www.cms.gov/cms1500',
      bytes: 60000,
      sha256: null,
      pdfUrl: '/form-catalog-assets/healthcare/cms-1500__cms1500.pdf',
      thumbnailUrl: '/form-catalog-assets/healthcare/cms-1500__cms1500.webp',
      description: 'Use CMS-1500 to submit a health-insurance claim.',
      useCase: '',
    },
    {
      slug: 'cms-10106',
      formNumber: 'CMS-10106',
      title: 'Authorization to Disclose Personal Health Information',
      section: 'healthcare',
      filename: 'cms-10106__cms10106.pdf',
      year: null,
      isPriorYear: false,
      sourceUrl: 'https://www.cms.gov/cms10106',
      bytes: 189000,
      sha256: null,
      pdfUrl: '/form-catalog-assets/healthcare/cms-10106__cms10106.pdf',
      thumbnailUrl: '/form-catalog-assets/healthcare/cms-10106__cms10106.webp',
      description: 'Use CMS-10106 to authorize disclosure of personal health info.',
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

vi.mock('../../../../src/config/formCatalogCategories.mjs', () => ({
  FORM_CATALOG_CATEGORIES: [
    { key: 'hr_onboarding', label: 'HR & Onboarding', sections: ['hr_onboarding'], count: 2, empty: false, emptyReason: null },
    { key: 'healthcare', label: 'Healthcare & Medicine', sections: ['healthcare', 'patient_intake'], count: 2, empty: false, emptyReason: null },
    { key: 'contracts_procurement', label: 'Contracts & Procurement', sections: ['contracts_procurement'], count: 0, empty: true, emptyReason: 'External list.' },
    { key: 'criminal_justice', label: 'Federal Criminal', sections: ['criminal_justice'], count: 0, empty: true, emptyReason: 'External list.' },
    { key: 'hipaa', label: 'HIPAA', sections: ['hipaa'], count: 0, empty: true, emptyReason: 'Copyright restricted.' },
  ],
  FORM_CATALOG_TOTAL_COUNT: 4,
}));

vi.mock('../../../../src/config/formCatalogExternalSources.mjs', () => ({
  FORM_CATALOG_EXTERNAL_SOURCES: {
    hipaa: {
      key: 'hipaa',
      label: 'HIPAA',
      sourceFile: 'form_catalog/hipaa/links.txt',
      links: [
        {
          label: 'Sample HIPAA Authorization for Research',
          url: 'https://www.hhs.gov/sample-authorization.pdf',
        },
        {
          label: '45 CFR 164.508',
          url: 'https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.508',
        },
      ],
    },
    contracts_procurement: {
      key: 'contracts_procurement',
      label: 'Contracts & Procurement',
      sourceFile: 'form_catalog/contracts_procurement/links.txt',
      links: [
        {
          label: 'GSA forms index',
          url: 'https://www.gsa.gov/reference/forms',
        },
        {
          label: 'SF-1449 - Solicitation/Contract/Order for Commercial Products and Commercial Services',
          url: 'https://www.gsa.gov/system/files/SF1449-21.pdf',
        },
      ],
    },
    criminal_justice: {
      key: 'criminal_justice',
      label: 'Federal Criminal',
      sourceFile: 'form_catalog/criminal_justice/links.txt',
      links: [
        {
          label: 'U.S. Courts criminal forms index',
          url: 'https://www.uscourts.gov/forms-rules/forms/criminal-forms',
        },
        {
          label: 'AO 91 - Criminal Complaint',
          url: 'https://www.uscourts.gov/sites/default/files/ao091.pdf',
        },
      ],
    },
  },
}));

import FormCatalogIndexPage from '../../../../src/components/pages/FormCatalogIndexPage';

const buildFakeUser = () => ({
  uid: 'fake-uid',
  email: 'fake@example.com',
} as unknown as Parameters<typeof FormCatalogIndexPage>[0]['verifiedUser']);

describe('FormCatalogIndexPage', () => {
  it('renders catalog with sign-in button for unauthenticated users', () => {
    const onRequestSignIn = vi.fn();
    render(
      <FormCatalogIndexPage
        verifiedUser={null}
        onRequestSignIn={onRequestSignIn}
        onNavigate={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { level: 1, name: /Pre-made fillable PDF templates/i })).toBeTruthy();
    const signInButton = screen.getByRole('button', { name: /Sign in/i });
    signInButton.click();
    expect(onRequestSignIn).toHaveBeenCalledTimes(1);
  });

  it('disables the search input until a category is selected', async () => {
    const user = userEvent.setup();
    render(
      <FormCatalogIndexPage
        verifiedUser={buildFakeUser()}
        onRequestSignIn={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    const searchInput = screen.getByRole('searchbox');
    expect(searchInput.hasAttribute('disabled')).toBe(true);

    await user.click(screen.getByRole('tab', { name: /HR & Onboarding/i }));
    expect(searchInput.hasAttribute('disabled')).toBe(false);
  });

  it('filters visible cards by category + query', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <FormCatalogIndexPage
        verifiedUser={buildFakeUser()}
        onRequestSignIn={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    await user.click(screen.getByRole('tab', { name: /Healthcare & Medicine/i }));
    expect(screen.getAllByRole('link').some((link) => /CMS-1500/.test(link.textContent || ''))).toBe(true);
    expect(screen.queryByRole('link', { name: /Employment Eligibility Verification/i })).toBeNull();

    const searchInput = screen.getByRole('searchbox');
    await user.type(searchInput, '10106');
    const remainingLinks = screen.getAllByRole('link').filter((link) => /CMS-10106|CMS-1500/.test(link.textContent || ''));
    expect(remainingLinks.length).toBe(1);
    expect(remainingLinks[0].textContent).toMatch(/CMS-10106/);
  });

  it('renders external-link categories as clickable chips without a count badge', async () => {
    const user = userEvent.setup();
    render(
      <FormCatalogIndexPage
        verifiedUser={buildFakeUser()}
        onRequestSignIn={vi.fn()}
        onNavigate={vi.fn()}
      />,
    );

    const hipaaChip = screen.getByRole('tab', { name: /HIPAA/i });
    expect(hipaaChip.hasAttribute('disabled')).toBe(false);
    expect(within(hipaaChip).queryByText('0')).toBeNull();

    await user.click(hipaaChip);

    expect(screen.getByRole('heading', { level: 3, name: 'HIPAA' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Sample HIPAA Authorization for Research/i }).getAttribute('href'),
    ).toBe('https://www.hhs.gov/sample-authorization.pdf');
    expect(
      screen.getByRole('link', { name: /45 CFR 164.508/i }).getAttribute('href'),
    ).toBe('https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-E/section-164.508');

    const contractsChip = screen.getByRole('tab', { name: /Contracts & Procurement/i });
    expect(contractsChip.hasAttribute('disabled')).toBe(false);
    expect(within(contractsChip).queryByText('0')).toBeNull();
    await user.click(contractsChip);
    expect(screen.getByRole('heading', { level: 3, name: 'Contracts & Procurement' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /SF-1449/i }).getAttribute('href'),
    ).toBe('https://www.gsa.gov/system/files/SF1449-21.pdf');

    const criminalChip = screen.getByRole('tab', { name: /Federal Criminal/i });
    expect(criminalChip.hasAttribute('disabled')).toBe(false);
    expect(within(criminalChip).queryByText('0')).toBeNull();
    await user.click(criminalChip);
    expect(screen.getByRole('heading', { level: 3, name: 'Federal Criminal' })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /AO 91 - Criminal Complaint/i }).getAttribute('href'),
    ).toBe('https://www.uscourts.gov/sites/default/files/ao091.pdf');
  });

  it('navigates to a form detail route when a card is clicked', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(
      <FormCatalogIndexPage
        verifiedUser={buildFakeUser()}
        onRequestSignIn={vi.fn()}
        onNavigate={onNavigate}
      />,
    );

    // Featured view shows W-9 and I-9 (both in featured list and in the mock data).
    const featuredLinks = screen.getAllByRole('link');
    const w9Link = featuredLinks.find((link) => /W-9/.test(link.textContent || ''));
    expect(w9Link).toBeTruthy();
    if (!w9Link) return;
    await user.click(w9Link);
    expect(onNavigate).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'form-catalog-form', slug: 'w-9' }),
    );
  });
});
