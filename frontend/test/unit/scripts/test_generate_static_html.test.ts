import { describe, expect, it } from 'vitest';
import { ALL_ROUTES } from '../../../../scripts/seo-route-data.mjs';
import { generatePageHtml } from '../../../../scripts/generate-static-html.mjs';

const EMPTY_VITE_ASSETS = {
  headScriptTags: [],
  linkTags: [],
  scriptTags: [],
};

describe('generate-static-html', () => {
  it('renders a visible prerendered shell ahead of the React root', () => {
    const route = ALL_ROUTES.find((entry) => entry.path === '/fill-pdf-from-csv');
    expect(route).toBeTruthy();

    const html = generatePageHtml(route!, EMPTY_VITE_ASSETS);

    expect(html).toContain('data-seo-jsonld="true"');
    expect(html).toContain('data-seo-shell-visible="true"');
    expect(html).toContain('id="seo-static-shell"');
    expect(html).toContain('Fill PDF From CSV, SQL, Excel, or JSON Data');
    expect(html).toContain('Try DullyPDF Now');
    expect(html).toContain('<div id="root"></div>');
  });

  it('includes head SEO signals for usage docs pages', () => {
    const route = ALL_ROUTES.find((entry) => entry.path === '/usage-docs/getting-started');
    expect(route).toBeTruthy();

    const html = generatePageHtml(route!, EMPTY_VITE_ASSETS);

    expect(html).toContain('<title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('rel="canonical"');
  });

  it('includes head SEO signals for blog index', () => {
    const route = ALL_ROUTES.find((entry) => entry.path === '/blog');
    expect(route).toBeTruthy();

    const html = generatePageHtml(route!, EMPTY_VITE_ASSETS);

    expect(html).toContain('<title>');
    expect(html).toContain('name="description"');
    expect(html).toContain('data-seo-jsonld="true"');
  });
});
