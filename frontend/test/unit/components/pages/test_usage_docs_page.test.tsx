import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import UsageDocsPage from '../../../../src/components/pages/UsageDocsPage';

describe('UsageDocsPage', () => {
  it('renders English overview page by default', () => {
    render(<UsageDocsPage pageKey="index" />);

    expect(screen.getByRole('heading', { name: 'DullyPDF Usage Docs' })).toBeTruthy();
    const sidebar = screen.getByLabelText('Usage docs sidebar');
    expect(within(sidebar).getByRole('link', { name: 'Getting Started' }).getAttribute('href')).toBe(
      '/usage-docs/getting-started',
    );
    expect(within(sidebar).getByRole('link', { name: 'Detection' }).getAttribute('href')).toBe('/usage-docs/detection');
    expect(document.querySelector('section#pipeline-overview')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Official DullyPDF profiles' })).toBeTruthy();
  });

  it('renders overview page with sidebar page links and section anchors', () => {
    render(<UsageDocsPage locale="es" pageKey="index" />);

    expect(screen.getByRole('heading', { name: 'Documentación de Uso de DullyPDF' })).toBeTruthy();
    const sidebar = screen.getByLabelText('Barra lateral de documentación');
    expect(within(sidebar).getByRole('link', { name: 'Primeros pasos' }).getAttribute('href')).toBe(
      '/es/usage-docs/getting-started',
    );
    expect(within(sidebar).getByRole('link', { name: 'Detección' }).getAttribute('href')).toBe('/es/usage-docs/detection');
    expect(document.querySelector('section#resumen-del-flujo')).toBeTruthy();
    expect(document.querySelector('section#antes-de-empezar')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recorrido de 7 minutos por DullyPDF' })).toBeTruthy();
    expect(screen.getByTitle('Recorrido de 7 minutos por DullyPDF')).toBeTruthy();
    const profilesPanel = screen.getByRole('heading', { name: 'Perfiles oficiales de DullyPDF' }).closest('section');
    expect(profilesPanel).toBeTruthy();
    if (!profilesPanel) {
      throw new Error('Official profiles panel not found');
    }
    expect(within(profilesPanel).getByRole('link', { name: 'LinkedIn' }).getAttribute('href')).toBe(
      'https://www.linkedin.com/company/dullypdf',
    );
  });

  it('renders subroute content and marks active page in sidebar', () => {
    render(<UsageDocsPage locale="es" pageKey="rename-mapping" />);

    expect(screen.getByRole('heading', { name: 'Renombrar y Mapear Campos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Límites de datos enviados a OpenAI' })).toBeTruthy();

    const activePageLink = screen.getByRole('link', { name: 'Renombrar y mapear' });
    expect(activePageLink.className.includes('usage-docs-sidebar__page--active')).toBe(true);
  });

  it('renders dedicated Fill By Link docs content', () => {
    render(<UsageDocsPage locale="es" pageKey="fill-by-link" />);

    expect(screen.getByRole('heading', { name: 'Fill By Link' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Flujo del propietario' })).toBeTruthy();
    expect(screen.getByText(/formulario web basado en una plantilla guardada/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Formulario PDF con link' }).getAttribute('href')).toBe('/es/formulario-pdf-con-link');
  });

  it('renders dedicated signature workflow docs content', () => {
    render(<UsageDocsPage locale="es" pageKey="signature-workflow" />);

    expect(screen.getByRole('heading', { name: 'Flujo de Firma para EE. UU.' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Alcance disponible en EE. UU.' })).toBeTruthy();
    expect(screen.getAllByText(/Estados Unidos/i).length).toBeGreaterThan(0);
  });

  it('renders dedicated API Fill docs content', () => {
    render(<UsageDocsPage locale="es" pageKey="api-fill" />);

    expect(screen.getByRole('heading', { name: 'API Fill' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Flujo del manager' })).toBeTruthy();
    expect(screen.getByText(/endpoint backend/i)).toBeTruthy();
  });

  it('updates document title based on page key', () => {
    const { rerender } = render(<UsageDocsPage locale="es" pageKey="index" />);
    expect(document.title).toBe('Documentación para Formularios PDF Rellenables | DullyPDF');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es/usage-docs');

    rerender(<UsageDocsPage locale="es" pageKey="search-fill" />);
    expect(document.title).toBe('Rellenar PDFs desde Excel, CSV o JSON | DullyPDF');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es/usage-docs/search-fill');
  });

  it('renders the focused PDF conversion demo on getting started docs', () => {
    render(<UsageDocsPage locale="es" pageKey="getting-started" />);

    expect(screen.getByRole('heading', { name: 'Recorrido de 3 minutos: PDF a formulario rellenable' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver en YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/JIVx5VrtkAg?si=XsswWbjanIVnY5vp',
    );
  });

  it('renders the fill-by-file demo on the Search & Fill docs page', () => {
    render(<UsageDocsPage locale="es" pageKey="search-fill" />);

    expect(
      screen.getByRole('heading', { name: 'Rellenar PDF desde CSV, Excel o JSON' }),
    ).toBeTruthy();
    expect(screen.getByTitle('Rellenar PDF desde CSV, Excel o JSON')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver en YouTube' }).getAttribute('href')).toBe(
      'https://youtu.be/CT3IEzh4p10',
    );
  });

  it('does not render the U.S. signing demo on the Fill By Link docs page', () => {
    render(<UsageDocsPage locale="es" pageKey="fill-by-link" />);

    expect(
      screen.queryByRole('heading', { name: /sign it in the browser/i }),
    ).toBeNull();
  });
});
