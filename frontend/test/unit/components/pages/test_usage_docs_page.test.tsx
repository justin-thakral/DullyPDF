import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import UsageDocsPage from '../../../../src/components/pages/UsageDocsPage';

describe('UsageDocsPage', () => {
  it('renders overview page with sidebar page links and section anchors', () => {
    render(<UsageDocsPage pageKey="index" />);

    expect(screen.getByRole('heading', { name: 'DullyPDF Usage Docs' })).toBeTruthy();
    const sidebar = screen.getByLabelText('Usage docs sidebar');
    expect(within(sidebar).getByRole('link', { name: 'Getting Started' }).getAttribute('href')).toBe(
      '/usage-docs/getting-started',
    );
    expect(within(sidebar).getByRole('link', { name: 'Detection' }).getAttribute('href')).toBe('/usage-docs/detection');
    expect(document.querySelector('section#pipeline-overview')).toBeTruthy();
    expect(document.querySelector('section#before-you-start')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '7-minute DullyPDF feature walkthrough' })).toBeTruthy();
    expect(screen.getByTitle('7-minute DullyPDF feature walkthrough')).toBeTruthy();
    const profilesPanel = screen.getByRole('heading', { name: 'Official DullyPDF profiles' }).closest('section');
    expect(profilesPanel).toBeTruthy();
    if (!profilesPanel) {
      throw new Error('Official profiles panel not found');
    }
    expect(within(profilesPanel).getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe(
      'https://www.linkedin.com/company/dullypdf',
    );
  });

  it('renders subroute content and marks active page in sidebar', () => {
    render(<UsageDocsPage pageKey="rename-mapping" />);

    expect(screen.getByRole('heading', { name: 'Rename + Mapping' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'OpenAI data boundaries' })).toBeTruthy();

    const activePageLink = screen.getByRole('link', { name: 'Rename + Mapping' });
    expect(activePageLink.className.includes('usage-docs-sidebar__page--active')).toBe(true);
  });

  it('renders dedicated Fill By Link docs content', () => {
    render(<UsageDocsPage pageKey="fill-by-link" />);

    expect(screen.getByRole('heading', { name: 'Fill By Link' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Owner publishing flow' })).toBeTruthy();
    expect(screen.getByText(/post-submit button/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fill PDF By Link' }).getAttribute('href')).toBe('/fill-pdf-by-link');
  });

  it('renders dedicated signature workflow docs content', () => {
    render(<UsageDocsPage pageKey="signature-workflow" />);

    expect(screen.getByRole('heading', { name: 'Signature Workflow' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Two entry paths, one signing engine' })).toBeTruthy();
    expect(screen.getByText(/E-SIGN and UETA/i)).toBeTruthy();
  });

  it('renders dedicated API Fill docs content', () => {
    render(<UsageDocsPage pageKey="api-fill" />);

    expect(screen.getByRole('heading', { name: 'API Fill' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Owner manager flow' })).toBeTruthy();
    expect(screen.getByText(/hosted backend endpoint that accepts JSON and returns a PDF/i)).toBeTruthy();
  });

  it('updates document title based on page key', () => {
    const { rerender } = render(<UsageDocsPage pageKey="index" />);
    expect(document.title).toBe('PDF Form Automation Docs and Workflow Guide | DullyPDF');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/usage-docs');

    rerender(<UsageDocsPage pageKey="search-fill" />);
    expect(document.title).toBe('Search & Fill Records and Saved Respondents Into PDFs | DullyPDF Docs');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/usage-docs/search-fill');
  });

  it('renders the focused PDF conversion demo on getting started docs', () => {
    render(<UsageDocsPage pageKey="getting-started" />);

    expect(screen.getByRole('heading', { name: '3-minute PDF to Fillable walkthrough' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/JIVx5VrtkAg?si=XsswWbjanIVnY5vp',
    );
  });

  it('renders the fill-by-file demo on the Search & Fill docs page', () => {
    render(<UsageDocsPage pageKey="search-fill" />);

    expect(
      screen.getByRole('heading', { name: 'Fill PDF from CSV, Excel, JSON, SQL, or TXT' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill PDF from CSV, Excel, JSON, SQL, or TXT')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/CT3IEzh4p10',
    );
  });

  it('renders the web form + sign demo on the Fill By Link docs page', () => {
    render(<UsageDocsPage pageKey="fill-by-link" />);

    expect(
      screen.getByRole('heading', { name: 'Fill a PDF web form and sign it in the browser' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Fill a PDF web form and sign it in the browser')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/mXtmgrCOitM',
    );
  });
});
