#!/usr/bin/env node
/**
 * Auto-generate sitemap.xml from the shared public SEO route dataset exposed via
 * seo-route-data.mjs.
 * Writes to frontend/dist/sitemap.xml (must run after Vite build).
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

function main() {
  let videoEntryCount = 0;
  const entries = ALL_ROUTES.map((route) => {
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

  const outputPath = join(DIST_DIR, 'sitemap.xml');
  writeFileSync(outputPath, xml, 'utf-8');
  console.log(
    `Generated sitemap.xml with ${entries.length} URLs (including ${videoEntryCount} video entries) at ${outputPath}`,
  );
}

main();
