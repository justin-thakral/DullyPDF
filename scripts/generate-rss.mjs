#!/usr/bin/env node
/**
 * Auto-generate an Atom feed from blog posts defined in blogContent.mjs.
 * Writes to frontend/dist/feed.xml (must run after Vite build).
 */

import { writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { SITE_ORIGIN } from './seo-route-data.mjs';
import { BLOG_POSTS } from '../frontend/src/config/blogContent.mjs';

const DIST_DIR = resolve(process.cwd(), 'frontend/dist');

function escXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function main() {
  const sorted = [...BLOG_POSTS].sort(
    (a, b) => b.publishedDate.localeCompare(a.publishedDate),
  );

  const updated = sorted.length > 0
    ? `${sorted[0].updatedDate || sorted[0].publishedDate}T00:00:00Z`
    : new Date().toISOString();

  const entries = sorted.map((post) => {
    const url = `${SITE_ORIGIN}/blog/${post.slug}`;
    const published = `${post.publishedDate}T00:00:00Z`;
    const modified = `${post.updatedDate || post.publishedDate}T00:00:00Z`;

    return `  <entry>
    <title>${escXml(post.title)}</title>
    <link href="${escXml(url)}" rel="alternate" type="text/html"/>
    <id>${escXml(url)}</id>
    <published>${published}</published>
    <updated>${modified}</updated>
    <summary>${escXml(post.seoDescription)}</summary>
    <author><name>${escXml(post.author)}</name></author>
  </entry>`;
  });

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>DullyPDF Blog</title>
  <subtitle>PDF form automation workflows, field detection, and fill strategies.</subtitle>
  <link href="${SITE_ORIGIN}/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="${SITE_ORIGIN}/blog" rel="alternate" type="text/html"/>
  <id>${SITE_ORIGIN}/blog</id>
  <updated>${updated}</updated>
  <icon>${SITE_ORIGIN}/DullyPDFLogoImproved.png</icon>
${entries.join('\n')}
</feed>
`;

  const outputPath = join(DIST_DIR, 'feed.xml');
  writeFileSync(outputPath, feed, 'utf-8');
  console.log(`Generated feed.xml with ${entries.length} entries at ${outputPath}`);
}

main();
