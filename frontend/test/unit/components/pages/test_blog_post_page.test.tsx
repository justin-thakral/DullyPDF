import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogPostPage from '../../../../src/components/pages/BlogPostPage';

describe('BlogPostPage', () => {
  it('renders visible publish/update dates and inline workflow links for a real post', () => {
    render(<BlogPostPage slug="auto-fill-pdf-from-spreadsheet" />);

    expect(screen.getByRole('heading', { name: 'How to Auto-Fill PDF Forms From a Spreadsheet (CSV or Excel)' })).toBeTruthy();
    expect(screen.getByText('Published')).toBeTruthy();
    expect(screen.getByText('Last updated')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Prepare the spreadsheet like production data, not like a demo file' })).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: 'Fill PDF From CSV' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Search & Fill' }).length).toBeGreaterThan(0);
    expect(
      Array.from(document.querySelectorAll('script[data-seo-jsonld="true"]')).some((node) =>
        node.textContent?.includes('"@type":"BreadcrumbList"'),
      ),
    ).toBe(true);
  });

  it('applies noindex metadata when the requested blog slug does not exist', () => {
    render(<BlogPostPage slug="not-a-real-post" />);

    expect(screen.getByRole('heading', { name: 'Post not found' })).toBeTruthy();
    expect(screen.getByText('/blog/not-a-real-post')).toBeTruthy();
    expect(document.title).toBe('Blog Post Not Found (404) | DullyPDF');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/blog');
  });

  it('renders the Anvil comparison post with dated pricing copy and workflow links', () => {
    render(<BlogPostPage slug="dullypdf-vs-anvil-pdf-automation-pricing" />);

    expect(
      screen.getByRole('heading', {
        name: 'DullyPDF vs Anvil for PDF Automation, API Fill, Web Form Fill, and Pricing',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', {
        name: 'Pricing comparison: why DullyPDF is the lower-cost option for this workflow',
      }),
    ).toBeTruthy();
    expect(screen.getAllByText(/\$99 per month/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\$425 per month/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole('link', { name: 'PDF Fill API' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'API Fill' }).length).toBeGreaterThan(0);
  });

  it('renders the USCIS packet automation guide with catalog and official-source links', () => {
    render(<BlogPostPage slug="uscis-immigration-packet-automation" />);

    expect(
      screen.getByRole('heading', {
        name: 'USCIS Immigration Packet Automation: Fill Repeated Forms From One Intake Record',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Start with a small packet set before you try to automate every immigration PDF' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open I-485 in the catalog/i }).getAttribute('href')).toBe('/forms/i-485');
    expect(screen.getByRole('link', { name: /Official USCIS I-485 page/i }).getAttribute('href')).toBe('https://www.uscis.gov/i-485');
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('link', { name: 'Government Form Automation' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Rename + Mapping' }).length).toBeGreaterThan(0);
  });

  it('renders the VA disability packet automation guide with catalog and official-source links', () => {
    render(<BlogPostPage slug="va-disability-claim-packet-automation" />);

    expect(
      screen.getByRole('heading', {
        name: 'VA Disability Claim Packet Automation for Repeated Claimant Data',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Start with the claim forms that actually recur in your workflow' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open VA 21-526EZ in the catalog/i }).getAttribute('href')).toBe(
      '/forms/va-21-526ez',
    );
    expect(screen.getByRole('link', { name: /Official VA 21-526EZ page/i }).getAttribute('href')).toBe(
      'https://www.va.gov/forms/21-526ez',
    );
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('link', { name: 'Government Form Automation' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Create Group' }).length).toBeGreaterThan(0);
  });

  it('renders the Social Security disability packet guide with catalog and official-source links', () => {
    render(<BlogPostPage slug="social-security-disability-packet-automation" />);

    expect(
      screen.getByRole('heading', {
        name: 'Social Security Disability PDF Packet Automation',
      }),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Start with the SSA forms that define the packet stage' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open SSA-3368-BK in the catalog/i }).getAttribute('href')).toBe(
      '/forms/ssa-3368-bk',
    );
    expect(screen.getByRole('link', { name: /Official SSA-3368-BK PDF/i }).getAttribute('href')).toBe(
      'https://www.ssa.gov/forms/ssa-3368-bk.pdf',
    );
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('link', { name: 'PDF Signature Workflow' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Signature Workflow' }).length).toBeGreaterThan(0);
  });

  it.each([
    [
      'contractor-tax-onboarding-packet',
      'Contractor Tax Onboarding Packet: W-9, 1099, W-8, and EIN Forms',
      /Open W-9 in the catalog/i,
      '/forms/w-9',
      /Official IRS W-9 page/i,
      'https://www.irs.gov/forms-pubs/about-form-w-9',
    ],
    [
      'sba-loan-application-packet-automation',
      'SBA Loan Application Packet Automation',
      /Open SBA Form 1919 in the catalog/i,
      '/forms/sba-form-1919-borrower',
      /Official SBA Form 1919 page/i,
      'https://www.sba.gov/document/sba-form-1919-borrower-information-form',
    ],
    [
      'medicare-provider-enrollment-credentialing-packet',
      'Medicare Provider Enrollment and Credentialing PDF Automation',
      /Open CMS-855A in the catalog/i,
      '/forms/cms-855a',
      /Official CMS enrollment applications page/i,
      'https://www.cms.gov/Medicare/Provider-Enrollment-and-Certification/Enrollment-Applications',
    ],
    [
      'passport-ds-form-workflow',
      'Passport and Consular DS Form Workflow for Reusable Identity Data',
      /Open DS-11 in the catalog/i,
      '/forms/ds-11',
      /Official State Department passport forms page/i,
      'https://travel.state.gov/content/travel/en/passports/how-apply/forms.html',
    ],
    [
      'nonprofit-990-filing-packet-automation',
      'Nonprofit Form 990 Packet Automation for Annual Filing Workflows',
      /Open Form 990 in the catalog/i,
      '/forms/990',
      /Official IRS Form 990 page/i,
      'https://www.irs.gov/form990',
    ],
    [
      'payroll-quarter-year-end-form-automation',
      'Payroll Quarter-End and Year-End PDF Form Automation',
      /Open Form 941 in the catalog/i,
      '/forms/941',
      /Official IRS Form 941 page/i,
      'https://www.irs.gov/forms-pubs/about-form-941',
    ],
    [
      'medical-dental-intake-template-library',
      'Medical and Dental Intake Template Library: Turn Repeated Patient Forms Into Fillable PDFs',
      /Open dental registration in the catalog/i,
      '/forms/dpt-104',
      /HHS HIPAA Privacy Rule/i,
      'https://www.hhs.gov/hipaa/for-professionals/privacy/index.html',
    ],
  ])(
    'renders the %s guide with catalog and official-source links',
    (slug, heading, catalogLinkName, catalogHref, officialLinkName, officialHref) => {
      render(<BlogPostPage slug={slug} />);

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByRole('link', { name: catalogLinkName }).getAttribute('href')).toBe(catalogHref);
      expect(screen.getByRole('link', { name: officialLinkName }).getAttribute('href')).toBe(officialHref);
      expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    },
  );

  it.each([
    [
      'individual-tax-return-packet-automation',
      'Individual Tax Return Packet Automation for 1040, Schedules, Estimates, and Amendments',
      /Open Form 1040 in the catalog/i,
      '/forms/1040',
      /Official IRS Form 1040 page/i,
      'https://www.irs.gov/Form1040',
    ],
    [
      'business-tax-return-packet-automation',
      'Business Tax Return Packet Automation for 1120, 1120-S, 1065, 1041, K-1, and Extensions',
      /Open Form 1120 in the catalog/i,
      '/forms/1120',
      /Official IRS Form 1120 page/i,
      'https://www.irs.gov/forms-pubs/about-form-1120',
    ],
    [
      'irs-collection-offer-in-compromise-packet-automation',
      'IRS Collection and Offer in Compromise Packet Automation',
      /Open Form 433-A in the catalog/i,
      '/forms/433-a',
      /Official IRS Offer in Compromise page/i,
      'https://www.irs.gov/payments/offer-in-compromise',
    ],
    [
      'medicare-beneficiary-enrollment-appeals-packet',
      'Medicare Beneficiary Enrollment and Appeals PDF Packet Automation',
      /Open CMS-40B in the catalog/i,
      '/forms/cms-40b',
      /Official CMS Forms page/i,
      'https://www.cms.gov/medicare/forms-notices/cms-forms',
    ],
    [
      'fmla-leave-certification-packet-automation',
      'FMLA Leave Certification Packet Automation for WH-380, WH-381, WH-382, WH-384, and WH-385',
      /Open WH-380-E in the catalog/i,
      '/forms/wh-380-e',
      /Official DOL FMLA forms page/i,
      'https://www.dol.gov/agencies/whd/fmla/forms',
    ],
    [
      'feca-owcp-federal-worker-injury-packet-automation',
      'FECA and OWCP Federal Worker Injury Packet Automation',
      /Open CA-1 in the catalog/i,
      '/forms/ca-1',
      /Official DOL OWCP forms page/i,
      'https://www.dol.gov/index.php/agencies/owcp/FECA/regs/compliance/forms',
    ],
    [
      'federal-employment-security-clearance-form-packet',
      'Federal Employment and Security Clearance Form Packet Automation',
      /Open OF-306 in the catalog/i,
      '/forms/of-306-b690ec40',
      /Official OPM federal investigation forms page/i,
      'https://www.opm.gov/forms/Federal-Investigation-Forms/',
    ],
    [
      'bankruptcy-petition-schedules-packet-automation',
      'Bankruptcy Petition and Schedules PDF Packet Automation',
      /Open B 101 in the catalog/i,
      '/forms/b-101',
      /Official U.S. Courts bankruptcy forms page/i,
      'https://www.uscourts.gov/forms-rules/forms/bankruptcy-forms',
    ],
    [
      'cbp-import-entry-logistics-packet-automation',
      'CBP Import Entry and Logistics PDF Packet Automation',
      /Open CBP 3461 in the catalog/i,
      '/forms/cbp-3461',
      /Official CBP Forms page/i,
      'https://www.cbp.gov/newsroom/publications/forms',
    ],
    [
      'hud-usda-housing-assistance-packet-automation',
      'HUD and USDA Housing Assistance PDF Packet Automation',
      /Open HUD-50059 in the catalog/i,
      '/forms/hud-50059',
      /Official HUD forms page/i,
      'https://www.hud.gov/hudclips/forms',
    ],
  ])(
    'renders the second-batch %s guide with catalog and official-source links',
    (slug, heading, catalogLinkName, catalogHref, officialLinkName, officialHref) => {
      render(<BlogPostPage slug={slug} />);

      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
      expect(screen.getByRole('link', { name: catalogLinkName }).getAttribute('href')).toBe(catalogHref);
      expect(screen.getByRole('link', { name: officialLinkName }).getAttribute('href')).toBe(officialHref);
      expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(3);
    },
  );
});
