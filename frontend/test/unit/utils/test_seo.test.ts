import { describe, expect, it } from 'vitest';
import { applyNoIndexSeo, applyRouteSeo } from '../../../src/utils/seo';

describe('SEO metadata utility', () => {
  it('applies title, canonical, and social tags for homepage route', () => {
    applyRouteSeo({ kind: 'app' });

    expect(document.title).toBe('DullyPDF — Automatic PDF to Fillable Form With Search & Fill');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toContain(
      'Turn any PDF into a fillable template',
    );
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://dullypdf.com/');
    expect(document.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe(
      'DullyPDF — Automatic PDF to Fillable Form With Search & Fill',
    );
    expect(document.querySelectorAll('script[data-seo-jsonld="true"]').length).toBeGreaterThan(0);
  });

  it('applies India homepage canonical and language metadata', () => {
    applyRouteSeo({ kind: 'app', market: 'india' });

    expect(document.documentElement.lang).toBe('en-IN');
    expect(document.title).toContain('India PDF Form Automation');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/in');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://dullypdf.com/in');
  });

  it('applies Spanish homepage canonical, language, and hreflang metadata', () => {
    applyRouteSeo({ kind: 'app', market: 'spanish' });

    expect(document.documentElement.lang).toBe('es');
    expect(document.title).toContain('Formularios PDF Rellenables');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es');
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe('https://dullypdf.com/es');
    expect(
      document.querySelector('link[rel="alternate"][hreflang="es"]')?.getAttribute('href'),
    ).toBe('https://dullypdf.com/es');
    expect(
      document.querySelector('link[rel="alternate"][hreflang="x-default"]')?.getAttribute('href'),
    ).toBe('https://dullypdf.com/');
  });

  it('applies canonical usage-docs paths even when docs content is section-specific', () => {
    applyRouteSeo({ kind: 'usage-docs', pageKey: 'rename-mapping' });

    expect(document.title).toBe('Rename PDF Fields and Map Them to Schema Headers | DullyPDF Docs');
    expect(document.querySelector('link[rel="alternate"][hreflang="es"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://dullypdf.com/usage-docs/rename-mapping',
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'Rename PDF Fields and Map Them to Schema Headers | DullyPDF Docs',
    );
    expect(document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toContain(
      'align them to headers',
    );
  });

  it('can apply noindex metadata for non-canonical routes', () => {
    applyRouteSeo({ kind: 'intent', intentKey: 'pdf-to-fillable-form' });
    expect(document.querySelectorAll('script[data-seo-jsonld="true"]').length).toBeGreaterThan(0);

    applyNoIndexSeo({
      title: 'Documentación no encontrada (404) | DullyPDF',
      description: 'No existe una página de documentación en esta ruta.',
      canonicalPath: '/es/usage-docs',
    });

    expect(document.title).toBe('Documentación no encontrada (404) | DullyPDF');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      'No existe una página de documentación en esta ruta.',
    );
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex,follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://dullypdf.com/es/usage-docs');
    expect(document.querySelectorAll('script[data-seo-jsonld="true"]').length).toBe(0);
  });
});
