#!/usr/bin/env node
/**
 * Auto-generate sitemap.xml from the shared public SEO route dataset exposed via
 * seo-route-data.mjs.
 *
 * Emits three files in frontend/dist/:
 *   - sitemap-main.xml   → home, legal, intent, docs, blog, feature-plan,
 *                          form-catalog-index, intent-hub (~150 URLs)
 *   - sitemap-forms.xml  → form-catalog-form routes only (~1,200 URLs)
 *   - sitemap.xml        → <sitemapindex> pointing at the two children
 *
 * The split lets Ahrefs + GSC report crawl/indexation coverage for the form
 * catalog independently from the rest of the site.
 * Must run after Vite build.
 */

import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ALL_ROUTES, SITE_ORIGIN } from './seo-route-data.mjs';

const DIST_DIR = resolve(process.cwd(), 'frontend/dist');
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

function getPriority(route) {
  if (route.kind === 'home') return '1.0';
  if (route.kind === 'legal') return '0.5';
  if (route.kind === 'usage-docs') return route.pageKey === 'index' ? '0.8' : '0.7';
  if (route.kind === 'intent') return route.category === 'workflow' ? '0.9' : '0.8';
  if (route.kind === 'blog-index') return '0.8';
  if (route.kind === 'blog-post') return '0.7';
  if (route.kind === 'form-catalog-index') return '0.9';
  if (route.kind === 'form-catalog-form') return '0.6';
  return '0.5';
}

function getChangefreq(route) {
  if (route.kind === 'home') return 'weekly';
  if (route.kind === 'legal') return 'yearly';
  if (route.kind === 'usage-docs') return route.pageKey === 'index' ? 'weekly' : 'monthly';
  if (route.kind === 'intent') return 'weekly';
  if (route.kind === 'blog-index') return 'weekly';
  if (route.kind === 'blog-post') return 'monthly';
  if (route.kind === 'form-catalog-index') return 'weekly';
  if (route.kind === 'form-catalog-form') return 'monthly';
  return 'monthly';
}

function escXml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildVideoBlock(video) {
  return `
    <video:video>
      <video:thumbnail_loc>${escXml(video.thumbnailUrl)}</video:thumbnail_loc>
      <video:title>${escXml(video.name)}</video:title>
      <video:description>${escXml(video.description)}</video:description>
      <video:content_loc>${escXml(video.contentUrl)}</video:content_loc>
      <video:player_loc>${escXml(video.embedUrl)}</video:player_loc>
      <video:publication_date>${escXml(video.uploadDate)}</video:publication_date>
      <video:family_friendly>yes</video:family_friendly>
      <video:requires_subscription>no</video:requires_subscription>
      <video:live>no</video:live>
      <video:uploader>DullyPDF</video:uploader>
    </video:video>`;
}

function buildUrlsetXml(routes) {
  let videoEntryCount = 0;
  const entries = routes.map((route) => {
    const loc = route.path === '/' ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${route.path}`;
    const video = route.seo?.video ?? null;
    if (video) videoEntryCount += 1;
    return `  <url>
    <loc>${escXml(loc)}</loc>
    <lastmod>${TODAY}</lastmod>
    <changefreq>${getChangefreq(route)}</changefreq>
    <priority>${getPriority(route)}</priority>${video ? buildVideoBlock(video) : ''}
  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${entries.join('\n')}
</urlset>
`;
  return { xml, urlCount: entries.length, videoEntryCount };
}

function buildSitemapIndexXml(childSitemapNames) {
  const entries = childSitemapNames.map((name) => `  <sitemap>
    <loc>${escXml(`${SITE_ORIGIN}/${name}`)}</loc>
    <lastmod>${TODAY}</lastmod>
  </sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</sitemapindex>
`;
}

function main() {
  // Pages flagged as lowValue (prior-year duplicates, blank stubs, near-
  // duplicate variant slugs) get <meta robots="noindex,follow"> in
  // generate-static-html.mjs. Don't list them in any sitemap — Google will
  // eventually drop them from the index and consolidate link equity onto the
  // cluster parent via rel=canonical.
  const sitemapRoutes = ALL_ROUTES.filter((route) => !route.lowValue);
  const skippedCount = ALL_ROUTES.length - sitemapRoutes.length;

  const formRoutes = sitemapRoutes.filter((r) => r.kind === 'form-catalog-form');
  const mainRoutes = sitemapRoutes.filter((r) => r.kind !== 'form-catalog-form');

  const main = buildUrlsetXml(mainRoutes);
  const forms = buildUrlsetXml(formRoutes);
  const indexXml = buildSitemapIndexXml(['sitemap-main.xml', 'sitemap-forms.xml']);

  writeFileSync(join(DIST_DIR, 'sitemap-main.xml'), main.xml, 'utf-8');
  writeFileSync(join(DIST_DIR, 'sitemap-forms.xml'), forms.xml, 'utf-8');
  writeFileSync(join(DIST_DIR, 'sitemap.xml'), indexXml, 'utf-8');

  console.log(
    `Generated sitemap index at ${join(DIST_DIR, 'sitemap.xml')}: ` +
      `sitemap-main.xml=${main.urlCount} URLs (${main.videoEntryCount} video), ` +
      `sitemap-forms.xml=${forms.urlCount} URLs, ` +
      `skipped=${skippedCount} lowValue routes.`,
  );
}

main();
