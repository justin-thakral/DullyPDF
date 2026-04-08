import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import IntentHubPage from '../../../../src/components/pages/IntentHubPage';

describe('IntentHubPage', () => {
  it('renders workflow hub copy and links', () => {
    render(<IntentHubPage hubKey="workflows" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Workflow Library for PDF Automation' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'How to use this library' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /PDF to Fillable Form/i }).getAttribute('href')).toBe('/pdf-to-fillable-form');
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
