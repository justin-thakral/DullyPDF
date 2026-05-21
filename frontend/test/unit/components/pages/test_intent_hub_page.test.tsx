import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import IntentHubPage from '../../../../src/components/pages/IntentHubPage';

describe('IntentHubPage', () => {
  it('renders workflow hub copy and links', () => {
    render(<IntentHubPage hubKey="workflows" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Workflow Library for PDF Automation' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'How to use this library' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /PDF to Fillable Form/i }).getAttribute('href')).toBe('/pdf-to-fillable-form');
    expect(
      screen.getAllByRole('link', { name: /PDF Form Catalog/i }).some((link) => link.getAttribute('href') === '/pdf-form-catalog'),
    ).toBe(true);
    expect(screen.getByAltText('A source PDF document before it has been turned into a reusable fillable template.')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'More workflow pages' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Usage Docs Overview' }).getAttribute('href')).toBe('/usage-docs');
    expect(screen.getByRole('heading', { level: 2, name: '7-minute DullyPDF feature walkthrough' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Watch on YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/vk-02uxbm3I?si=OLxy4rqYwv7yFqsE',
    );
    const profilePanel = screen.getByRole('heading', { level: 2, name: 'Follow DullyPDF outside the workflow library' }).closest('section');
    expect(profilePanel).toBeTruthy();
    if (!profilePanel) {
      throw new Error('Workflow hub profile panel not found');
    }
    expect(within(profilePanel).getByRole('link', { name: 'GitHub' }).getAttribute('href')).toBe(
      'https://github.com/justin-thakral/DullyPDF',
    );
  });

  it('keeps only the strongest new workflow pages in the screenshot preview section', () => {
    render(<IntentHubPage hubKey="workflows" />);

    const previewPanel = screen.getByRole('heading', { level: 2, name: 'All workflow pages' }).closest('section');
    const morePanel = screen.getByRole('heading', { level: 2, name: 'More workflow pages' }).closest('section');

    expect(previewPanel).toBeTruthy();
    expect(morePanel).toBeTruthy();
    if (!previewPanel || !morePanel) {
      throw new Error('Workflow hub panels not found');
    }

    expect(
      within(previewPanel).getByRole('link', { name: /Image, QR, PDF417 & 1D Barcode Fields/i }).getAttribute('href'),
    ).toBe('/pdf-field-types/image-qr-barcode-fields');
    expect(within(previewPanel).getByRole('link', { name: /PDF Calculation Fields/i }).getAttribute('href')).toBe(
      '/pdf-calculation-fields',
    );
    expect(within(previewPanel).getByRole('link', { name: /PDF Packet Workflow/i }).getAttribute('href')).toBe(
      '/pdf-packet-workflow',
    );

    expect(within(previewPanel).queryByRole('link', { name: /Add Image Field to PDF/i })).toBeNull();
    expect(within(previewPanel).queryByRole('link', { name: /Fill PDF From Image/i })).toBeNull();
    expect(within(previewPanel).queryByRole('link', { name: /No-Code PDF Automation/i })).toBeNull();

    expect(within(morePanel).getByRole('link', { name: /Add Image Field to PDF/i }).getAttribute('href')).toBe(
      '/add-image-field-to-pdf',
    );
    expect(within(morePanel).getByRole('link', { name: /Fill PDF From Image/i }).getAttribute('href')).toBe(
      '/fill-pdf-from-image',
    );
    expect(within(morePanel).getByRole('link', { name: /No-Code PDF Automation/i }).getAttribute('href')).toBe(
      '/no-code-pdf-automation',
    );
  });

  it('renders industry hub copy and links', () => {
    render(<IntentHubPage hubKey="industries" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Industry Solutions for Repeat PDF Workflows' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Healthcare PDF Automation/i }).getAttribute('href')).toBe(
      '/healthcare-pdf-automation',
    );
    expect(
      screen.getByAltText('Dental intake form page with patient, insurance, and medical-history fields.'),
    ).toBeTruthy();
  });
});
