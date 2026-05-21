import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import BlogIndexPage from '../../../../src/components/pages/BlogIndexPage';
import { getBlogPostLocale, getBlogPosts } from '../../../../src/config/blogPosts';

describe('BlogIndexPage', () => {
  it('renders Spanish blog hero, support content, and /es/blog links', () => {
    render(<BlogIndexPage locale="es" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Guías de Formularios PDF Rellenables' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo usar estas guías' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Flujos de trabajo' })[0].getAttribute('href')).toBe('/es/flujos-de-trabajo');
    expect(screen.getAllByRole('link', { name: 'Leer guía' })[0].getAttribute('href')).toMatch(/^\/es\/blog\//);
  });

  it('exports exactly 10 Spanish blog posts', () => {
    const slugs = getBlogPosts()
      .filter((post) => getBlogPostLocale(post) === 'es')
      .map((post) => post.slug);

    expect(slugs).toHaveLength(10);
    expect(slugs).toContain('como-crear-formulario-pdf-rellenable');
    expect(slugs).toContain('detectar-campos-pdf-con-ia');
    expect(slugs.every((slug) => !slug.includes('uscis') && !slug.includes('adobe'))).toBe(true);
  });

  it('renders the India blog index with only India guide links', () => {
    render(<BlogIndexPage locale="in" />);
    const readGuideHrefs = screen
      .getAllByRole('link', { name: 'Read guide' })
      .map((link) => link.getAttribute('href'));

    expect(screen.getByRole('heading', { level: 1, name: 'India PDF Form Automation Guides' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'How to use these India guides' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fill PDFs from Excel in India' }).getAttribute('href')).toBe('/in/fill-pdf-from-excel');
    expect(readGuideHrefs).toHaveLength(10);
    expect(readGuideHrefs).toContain('/in/blog/india-pdf-form-automation-guide');
    expect(readGuideHrefs).toContain('/in/blog/fill-indian-pdf-forms-from-excel');
    expect(screen.queryByText('Cómo Crear un Formulario PDF Rellenable desde un PDF Existente')).toBeNull();
  });

  it('exports exactly 10 India blog posts', () => {
    const slugs = getBlogPosts()
      .filter((post) => getBlogPostLocale(post) === 'in')
      .map((post) => post.slug);

    expect(slugs).toHaveLength(10);
    expect(slugs).toEqual(expect.arrayContaining([
      'india-pdf-form-automation-guide',
      'fill-indian-pdf-forms-from-excel',
      'india-kyc-pdf-automation-checklist',
      'vendor-onboarding-pdf-india',
      'gst-invoice-pdf-automation-india',
      'hr-joining-pdf-automation-india',
      'school-admission-pdf-automation-india',
      'clinic-intake-pdf-automation-india',
      'delivery-challan-pdf-automation-india',
      'india-pdf-fill-api-guide',
    ]));
  });
});
