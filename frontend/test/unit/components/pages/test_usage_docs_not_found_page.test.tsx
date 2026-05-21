import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import UsageDocsNotFoundPage from '../../../../src/components/pages/UsageDocsNotFoundPage';

describe('UsageDocsNotFoundPage', () => {
  it('renders docs 404 content and applies noindex metadata', () => {
    render(<UsageDocsNotFoundPage requestedPath="/es/usage-docs/not-a-real-page" />);

    expect(screen.getByRole('heading', { name: 'Página de documentación no encontrada' })).toBeTruthy();
    expect(screen.getByText('/es/usage-docs/not-a-real-page')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ir a la documentación' }).getAttribute('href')).toBe('/es/usage-docs');
    expect(document.title).toBe('Documentación no encontrada (404) | DullyPDF');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es/usage-docs');
  });
});
