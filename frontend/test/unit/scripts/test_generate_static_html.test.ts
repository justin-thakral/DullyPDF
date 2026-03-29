import { describe, expect, it } from 'vitest';
import { ALL_ROUTES } from '../../../../scripts/seo-route-data.mjs';
import { generatePageHtml } from '../../../../scripts/generate-static-html.mjs';

const EMPTY_VITE_ASSETS = {
  headScriptTags: [],
  linkTags: [],
  scriptTags: [],
};

describe('generate-static-html', () => {
  it('renders head-only SEO signals without a visible body shell', () => {
    const route = ALL_ROUTES.find((entry) => entry.path === '/fill-pdf-from-csv');
    expect(route).toBeTruthy();

    const html = generatePageHtml(route!, EMPTY_VITE_ASSETS);

    expect(html).toContain('data-seo-jsonld="true"');
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain('data-seo-shell-visible');
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
