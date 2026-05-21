import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import IntentHubPage from '../../../../src/components/pages/IntentHubPage';

describe('IntentHubPage', () => {
  it('renders the Spanish workflow hub with 10 /es workflow pages', () => {
    render(<IntentHubPage hubKey="workflows" locale="es" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Flujos para Formularios PDF Rellenables' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo usar esta biblioteca' })).toBeTruthy();

    const previewPanel = screen.getByRole('heading', { level: 2, name: 'Páginas de flujo en español' }).closest('section');
    expect(previewPanel).toBeTruthy();
    if (!previewPanel) throw new Error('Spanish workflow panel not found');

    const links = within(previewPanel).getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(within(previewPanel).getByRole('link', { name: /Crear formulario PDF rellenable/i }).getAttribute('href')).toBe(
      '/es/crear-formulario-pdf-rellenable',
    );
    expect(within(previewPanel).getByRole('link', { name: /API para rellenar PDF/i }).getAttribute('href')).toBe(
      '/es/api-rellenar-pdf',
    );
  });

  it('renders the Spanish industry hub with 10 /es industry pages', () => {
    render(<IntentHubPage hubKey="industries" locale="es" />);

    expect(screen.getByRole('heading', { level: 1, name: 'Soluciones PDF por Industria' })).toBeTruthy();

    const previewPanel = screen.getByRole('heading', { level: 2, name: 'Páginas por industria en español' }).closest('section');
    expect(previewPanel).toBeTruthy();
    if (!previewPanel) throw new Error('Spanish industry panel not found');

    const links = within(previewPanel).getAllByRole('link');
    expect(links).toHaveLength(10);
    expect(within(previewPanel).getByRole('link', { name: /Automatización PDF para clínicas/i }).getAttribute('href')).toBe(
      '/es/automatizacion-pdf-salud',
    );
    expect(within(previewPanel).getByRole('link', { name: /Automatización PDF para compras/i }).getAttribute('href')).toBe(
      '/es/automatizacion-pdf-compras-proveedores',
    );
  });
});
