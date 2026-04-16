import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import IntentLandingPage from '../../../../src/components/pages/IntentLandingPage';

describe('IntentLandingPage', () => {
  it('renders requested intent copy and related links', () => {
    render(<IntentLandingPage pageKey="fillable-form-field-name" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Standardize Fillable Form Field Names for Reliable Auto-Fill' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Try DullyPDF Now' }).getAttribute('href')).toBe('/');
    expect(screen.getByRole('link', { name: 'PDF to Database Template' }).getAttribute('href')).toBe(
      '/pdf-to-database-template',
    );
  });

  it('renders long-form article sections for expanded landing pages', () => {
    render(<IntentLandingPage pageKey="fill-pdf-from-csv" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Workflow examples for Fill PDF From CSV' })).toBeTruthy();
    expect(screen.getByAltText('Patient intake PDF preview with fields already filled from structured data.')).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'How Search and Fill works once the template is mapped' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/DullyPDF treats the PDF template and the row data as two separate layers/i),
    ).toBeTruthy();
  });

  it('renders the catalog explainer route with direct catalog links', () => {
    render(<IntentLandingPage pageKey="pdf-form-catalog" />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Browse a PDF Form Catalog of Official Blank Forms' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What each catalog entry contains' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse Form Catalog' }).getAttribute('href')).toBe('/forms');
    expect(
      screen.getAllByRole('link', { name: 'Government Form Automation' }).some((link) => (
        link.getAttribute('href') === '/government-form-automation'
      )),
    ).toBe(true);
    expect(
      screen.getByRole('heading', { level: 2, name: 'All form catalog categories in DullyPDF' }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Settlement statements, tenant packets, housing disclosures, and borrower-facing real-estate forms/i),
    ).toBeTruthy();
    expect(
      screen.getByText(/Representative PDF: HUD-1 — Settlement Statement\./i),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Browse Real Estate & Housing' }).getAttribute('href')).toBe(
      '/forms?category=real_estate_housing',
    );
  });

  it('renders the focused PDF conversion demo on the PDF to Fillable route', () => {
    render(<IntentLandingPage pageKey="pdf-to-fillable-form" />);

    expect(screen.getByRole('heading', { level: 2, name: '3-minute PDF to Fillable walkthrough' })).toBeTruthy();
    expect(screen.getByTitle('3-minute PDF to Fillable walkthrough')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/JIVx5VrtkAg?si=XsswWbjanIVnY5vp',
    );
  });

  it('renders the fill-by-file demo on the Fill PDF from CSV route', () => {
    render(<IntentLandingPage pageKey="fill-pdf-from-csv" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fill PDF from CSV, Excel, JSON, SQL, or TXT' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill PDF from CSV, Excel, JSON, SQL, or TXT')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/CT3IEzh4p10',
    );
  });

  it('renders the web form + sign demo on the Fill PDF By Link route', () => {
    render(<IntentLandingPage pageKey="fill-pdf-by-link" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Fill a PDF web form and sign it in the browser' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill a PDF web form and sign it in the browser')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/mXtmgrCOitM',
    );
  });

  it('uses targeted supporting docs from the shared SEO dataset', () => {
    render(<IntentLandingPage pageKey="pdf-fill-api" />);

    expect(screen.queryByRole('heading', { level: 2, name: /Workflow examples for /i })).toBeNull();
    expect(screen.getByRole('link', { name: 'API Fill' }).getAttribute('href')).toBe('/usage-docs/api-fill');
    expect(screen.getByRole('link', { name: 'Rename + Mapping' }).getAttribute('href')).toBe(
      '/usage-docs/rename-mapping',
    );
  });

  it('renders supporting visuals for industry landing pages', () => {
    render(<IntentLandingPage pageKey="government-form-automation" />);

    expect(screen.getByRole('heading', { level: 2, name: 'Workflow examples for Government Form Automation' })).toBeTruthy();
    expect(screen.getByAltText('Official IRS W-4 form page showing a fixed government layout.')).toBeTruthy();
  });

  it('renders curated catalog forms and automation steps for catalog-backed industry pages', () => {
    render(<IntentLandingPage pageKey="healthcare-pdf-automation" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Featured healthcare and medical PDFs from the DullyPDF catalog' }),
    ).toBeTruthy();
    expect(
      screen
        .getAllByRole('link', { name: 'Open CMS-855I in DullyPDF' })
        .every((link) => link.getAttribute('href') === '/upload?catalogSlug=cms-855i-cms-855i-cms855i'),
    ).toBe(true);
    expect(screen.getByText('10 specific forms to automate on this route')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'API Fill docs' }).getAttribute('href'),
    ).toBe('/usage-docs/api-fill');
    expect(
      screen.getByRole('link', { name: 'Signature workflow docs' }).getAttribute('href'),
    ).toBe('/usage-docs/signature-workflow');
  });

  it('renders inline legal footnotes and the numbered source list for authority-style pages', () => {
    render(<IntentLandingPage pageKey="esign-ueta-pdf-workflow" />);

    expect(
      screen.getByRole('heading', { level: 2, name: 'Legal footnotes and sources for E-SIGN / UETA PDF Workflow' }),
    ).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /See legal footnote/i }).length).toBeGreaterThan(5);
    expect(screen.getByRole('link', { name: 'See legal footnote 1a' }).getAttribute('href')).toBe('#footnote-esign-7001');
    expect(screen.getByRole('link', { name: 'See legal footnote 1b' }).getAttribute('href')).toBe('#footnote-esign-7001');
    expect(
      screen.getByRole('link', { name: '15 U.S.C. § 7001 | General rule of validity and related provisions' }).getAttribute('href'),
    ).toBe('https://www.law.cornell.edu/uscode/text/15/7001');
    expect(
      screen.getByRole('link', { name: '21 CFR Part 11 | Electronic records and electronic signatures' }).getAttribute('href'),
    ).toBe('https://www.law.cornell.edu/cfr/text/21/part-11');
    expect(
      screen.getByRole('link', { name: 'Back to first reference for footnote 1a' }).getAttribute('href'),
    ).toBe('#footnote-ref-esign-7001-1');
  });
});
