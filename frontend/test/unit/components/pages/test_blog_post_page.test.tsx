import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogPostPage from '../../../../src/components/pages/BlogPostPage';

describe('BlogPostPage', () => {
  it('renders Spanish publish metadata and inline workflow links for a real post', () => {
    render(<BlogPostPage slug="rellenar-pdf-desde-excel-guia" locale="es" />);

    expect(screen.getByRole('heading', { name: 'Cómo Rellenar un PDF desde Excel sin Copiar y Pegar' })).toBeTruthy();
    expect(screen.getByText('Publicado')).toBeTruthy();
    expect(screen.getByText('Recursos clave')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'La hoja debe tener encabezados que parezcan campos' })).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'Rellenar PDF desde Excel' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'Mapear datos a PDF' }).length).toBeGreaterThan(0);
    expect(
      Array.from(document.querySelectorAll('script[data-seo-jsonld="true"]')).some((node) =>
        node.textContent?.includes('"@type":"BreadcrumbList"'),
      ),
    ).toBe(true);
  });

  it('applies noindex metadata when the requested Spanish blog slug does not exist', () => {
    render(<BlogPostPage slug="not-a-real-post" locale="es" />);

    expect(screen.getByRole('heading', { name: 'Guía no encontrada' })).toBeTruthy();
    expect(screen.getByText('/es/blog/not-a-real-post')).toBeTruthy();
    expect(document.title).toBe('Blog Post Not Found (404) | DullyPDF');
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es/blog');
  });

  it('renders the India blog post with India workflow links and en-IN metadata', () => {
    render(<BlogPostPage slug="india-pdf-form-automation-guide" locale="in" />);

    expect(screen.getByRole('heading', { name: 'PDF Form Automation in India: KYC, Vendor, HR, GST, and Branch Workflows' })).toBeTruthy();
    expect(screen.getByText('Key India workflow links')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Start with one India document family, not a copied route set' })).toBeTruthy();
    expect(screen.getAllByRole('img').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('link', { name: 'India Excel to PDF Forms' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('link', { name: 'India KYC PDF Automation' }).length).toBeGreaterThan(0);
    expect(document.documentElement.lang).toBe('en-IN');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://dullypdf.com/in/blog/india-pdf-form-automation-guide',
    );
  });

  it('applies noindex metadata when the requested India blog slug does not exist', () => {
    render(<BlogPostPage slug="not-a-real-post" locale="in" />);

    expect(screen.getByRole('heading', { name: 'Guide not found' })).toBeTruthy();
    expect(screen.getByText('/in/blog/not-a-real-post')).toBeTruthy();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/in/blog');
  });
});
