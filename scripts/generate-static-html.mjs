/**
 * Static HTML generator for DullyPDF public routes.
 *
 * The client build provides the CSS/JS asset graph, and the dedicated SSR
 * renderer provides the exact React markup that the browser will hydrate.
 * This keeps first paint and post-hydration DOM aligned for the homepage and
 * every indexable public route.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  ALL_ROUTES,
  SITE_ORIGIN,
  DEFAULT_SOCIAL_IMAGE_PATH,
} from './seo-route-data.mjs';

const DIST_DIR = resolve(process.cwd(), 'frontend/dist');
const SSR_RENDERER_PATH = resolve(process.cwd(), 'frontend/dist-ssr/public-route-renderer.mjs');
const APP_SHELL_FILENAME = 'app-shell.html';

function generateAppShellHtml(indexHtml) {
  const stripped = indexHtml
    .replace(/\s*<style\b[^>]*data-homepage-hydration-cover="true"[\s\S]*?<\/style>/gi, '')
    .replace(/\s*<script\b[^>]*data-homepage-hydration-cover="true"[\s\S]*?<\/script>/gi, '')
    .replace(/\s*<div id="homepage-hydration-cover" aria-hidden="true"><\/div>/gi, '');

  // app-shell.html is served by Firebase rewrites for every SPA-only route:
  // /upload, /ui/*, /respond/:token, /sign/:token, /account-action,
  // /verify-email. These are interactive workspace entries, not content, and
  // must not be indexed. Without this tag, /upload?catalogSlug=<slug>
  // variants get crawled as duplicate copies of a generic "DullyPDF" shell
  // (Ahrefs flagged 60 such duplicates sharing one content hash). The
  // "follow" hint lets any equity from inbound links flow through to the
  // linked content pages.
  const robotsMeta = '<meta name="robots" content="noindex,follow" />';
  if (/<meta\s+name="robots"/i.test(stripped)) return stripped;
  return stripped.replace(/<head(\s[^>]*)?>/i, (match) => `${match}\n    ${robotsMeta}`);
}

function extractViteAssetTags(indexHtml) {
  const headMatch = indexHtml.match(/<head>([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : '';

  const headScriptTags = [];
  const headScriptRegex = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = headScriptRegex.exec(headHtml)) !== null) {
    if (scriptMatch[0].includes('type="module"')) continue;
    if (scriptMatch[0].includes('data-seo-jsonld="true"')) continue;
    if (scriptMatch[0].includes('data-homepage-hydration-cover="true"')) continue;
    headScriptTags.push(scriptMatch[0]);
  }

  const linkTags = [];
  const linkRegex = /<link\s[^>]*(?:rel="(?:stylesheet|modulepreload)")[^>]*\/?>/gi;
  let match;
  while ((match = linkRegex.exec(indexHtml)) !== null) {
    if (match[0].includes('fonts.googleapis.com') || match[0].includes('fonts.gstatic.com') || match[0].includes('icon')) continue;
    linkTags.push(match[0]);
  }

  const scriptTags = [];
  const scriptRegex = /<script\s[^>]*type="module"[^>]*><\/script>/gi;
  while ((match = scriptRegex.exec(indexHtml)) !== null) {
    scriptTags.push(match[0]);
  }

  return { headScriptTags, linkTags, scriptTags };
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function mapSeoRouteToHydratableRoute(route) {
  switch (route.kind) {
    case 'home':
      return { kind: 'home' };
    case 'legal':
      return { kind: 'legal', legalKind: route.pageKey };
    case 'intent-hub':
      return { kind: 'intent-hub', hubKey: route.pageKey };
    case 'feature-plan':
      return { kind: 'feature-plan', planKey: route.pageKey };
    case 'usage-docs':
      return { kind: 'usage-docs', pageKey: route.pageKey };
    case 'intent':
      return { kind: 'intent', intentKey: route.pageKey };
    case 'blog-index':
      return { kind: 'blog-index' };
    case 'blog-post':
      return { kind: 'blog-post', slug: route.slug };
    case 'form-catalog-index':
      return { kind: 'form-catalog-index' };
    case 'form-catalog-form':
      return { kind: 'form-catalog-form', slug: route.slug };
    default:
      throw new Error(`Unsupported public route kind for prerender: ${route.kind}`);
  }
}

function getHomepageHydrationCoverTags(route) {
  if (route.kind !== 'home') {
    return '';
  }

  return `
    <style data-homepage-hydration-cover="true">
      html {
        background: #ffffff;
      }

      body {
        background: #ffffff;
      }

      #homepage-hydration-cover {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: #ffffff;
      }
    </style>`;
}

/**
 * React 19's renderToString emits <link rel="preload"> Float hints inline
 * inside the rendered markup. During hydrateRoot the client does not produce
 * matching inline link nodes — it manages resources via the Float system
 * instead — so the extra nodes trigger a hydration mismatch (React error
 * #418). Strip them from the body markup and hoist them into <head> where
 * they still benefit the browser without breaking hydration.
 */
function extractPreloadLinks(markup) {
  const preloadLinks = [];
  const cleaned = markup.replace(/<link\s[^>]*rel="preload"[^>]*\/?>/gi, (tag) => {
    preloadLinks.push(tag);
    return '';
  });
  return { cleaned, preloadLinks };
}

function generatePageHtml(route, viteAssets, prerenderedMarkup) {
  const { seo } = route;
  const canonicalUrl = `${SITE_ORIGIN}${seo.canonicalPath}`;
  const resolvedOgImagePath = seo.ogImagePath || DEFAULT_SOCIAL_IMAGE_PATH;
  const imageUrl = resolvedOgImagePath.startsWith('http')
    ? resolvedOgImagePath
    : `${SITE_ORIGIN}${resolvedOgImagePath}`;
  const imageAlt = seo.ogImageAlt || 'DullyPDF logo';
  const ogTitle = seo.ogTitle || seo.title;
  const ogDescription = seo.ogDescription || seo.description;
  const twitterTitle = seo.twitterTitle || ogTitle;
  const twitterDescription = seo.twitterDescription || ogDescription;

  const structuredDataScripts = (seo.structuredData || [])
    .map((entry, index) =>
      `<script type="application/ld+json" data-seo-jsonld="true" data-seo-jsonld-index="${index}">${JSON.stringify(entry)}</script>`,
    )
    .join('\n    ');
  const homepageHydrationCoverTags = getHomepageHydrationCoverTags(route);
  // Open Graph video tags are safe on any platform that consumes them
  // (Facebook/LinkedIn). We intentionally do NOT emit a Twitter player card:
  // X/Twitter's player card requires the iframe to be on a whitelisted host
  // with a validated response, which arbitrary YouTube /embed/ URLs do not
  // satisfy — so a `twitter:card=player` referencing youtube.com renders as
  // an invalid card (flagged by Ahrefs as "incomplete"). We use
  // summary_large_image instead and let users click through to watch.
  const videoMetaTags = seo.video
    ? `
    <meta property="og:video" content="${esc(seo.video.embedUrl)}" />
    <meta property="og:video:url" content="${esc(seo.video.embedUrl)}" />
    <meta property="og:video:secure_url" content="${esc(seo.video.embedUrl)}" />
    <meta property="og:video:type" content="text/html" />
    <meta property="og:video:width" content="1280" />
    <meta property="og:video:height" content="720" />
    <meta property="og:video:tag" content="DullyPDF" />
    <link rel="video_src" href="${esc(seo.video.embedUrl)}" />`
    : '';

  const { cleaned: cleanedMarkup, preloadLinks } = extractPreloadLinks(prerenderedMarkup);
  const preloadLinkTags = preloadLinks.length
    ? '\n    ' + preloadLinks.join('\n    ')
    : '';

  return `<!doctype html>
<html lang="en">
  <head>
    ${viteAssets.headScriptTags.join('\n    ')}
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/DullyPDFLogoImproved.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${esc(seo.title)}</title>
    <meta name="description" content="${esc(seo.description)}" />
    <meta name="keywords" content="${esc(seo.keywords.join(', '))}" />
    <meta name="robots" content="${route.lowValue ? 'noindex,follow' : 'index,follow'}" />
    <link rel="canonical" href="${esc(canonicalUrl)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="DullyPDF" />
    <meta property="og:title" content="${esc(ogTitle)}" />
    <meta property="og:description" content="${esc(ogDescription)}" />
    <meta property="og:url" content="${esc(canonicalUrl)}" />
    <meta property="og:image" content="${esc(imageUrl)}" />
    <meta property="og:image:alt" content="${esc(imageAlt)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${esc(twitterTitle)}" />
    <meta name="twitter:description" content="${esc(twitterDescription)}" />
    <meta name="twitter:image" content="${esc(imageUrl)}" />${videoMetaTags}
    <link rel="alternate" type="application/atom+xml" title="DullyPDF Blog" href="${SITE_ORIGIN}/feed.xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />${preloadLinkTags}
    ${structuredDataScripts}
    ${homepageHydrationCoverTags}
    ${viteAssets.linkTags.join('\n    ')}
  </head>
  <body>
    ${route.kind === 'home' ? '<div id="homepage-hydration-cover" aria-hidden="true"></div>' : ''}
    <div id="root">${cleanedMarkup}</div>
    ${viteAssets.scriptTags.join('\n    ')}
  </body>
</html>
`;
}

async function loadPublicRouteRenderer() {
  if (!existsSync(SSR_RENDERER_PATH)) {
    throw new Error(
      `Missing ${SSR_RENDERER_PATH}. Run the frontend SSR build before generating static HTML.`,
    );
  }

  const rendererModule = await import(pathToFileURL(SSR_RENDERER_PATH).href);
  if (typeof rendererModule.renderPublicRouteHtml !== 'function') {
    throw new Error(`SSR renderer at ${SSR_RENDERER_PATH} does not export renderPublicRouteHtml.`);
  }

  return rendererModule.renderPublicRouteHtml;
}

async function main() {
  const indexHtmlPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    console.error(`Error: ${indexHtmlPath} does not exist. Run 'npm run frontend:build:prod' first.`);
    process.exit(1);
  }

  const indexHtml = readFileSync(indexHtmlPath, 'utf-8');
  const appShellHtml = generateAppShellHtml(indexHtml);
  const viteAssets = extractViteAssetTags(indexHtml);
  const renderPublicRouteHtml = await loadPublicRouteRenderer();

  console.log(`Extracted ${viteAssets.linkTags.length} link tags and ${viteAssets.scriptTags.length} script tags from index.html`);
  writeFileSync(join(DIST_DIR, APP_SHELL_FILENAME), appShellHtml, 'utf-8');
  console.log(`Generated ${APP_SHELL_FILENAME} in ${DIST_DIR}`);

  let generated = 0;
  for (const route of ALL_ROUTES) {
    const hydratableRoute = mapSeoRouteToHydratableRoute(route);
    const prerenderedMarkup = renderPublicRouteHtml(hydratableRoute);
    const html = generatePageHtml(route, viteAssets, prerenderedMarkup);

    let outputPath;
    if (route.path === '/') {
      outputPath = join(DIST_DIR, 'index.html');
    } else {
      const dir = join(DIST_DIR, route.path.slice(1));
      mkdirSync(dir, { recursive: true });
      outputPath = join(dir, 'index.html');
    }

    writeFileSync(outputPath, html, 'utf-8');
    generated += 1;
  }

  console.log(`Generated ${generated} static HTML files in ${DIST_DIR}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

export {
  extractPreloadLinks,
  extractViteAssetTags,
  generateAppShellHtml,
  generatePageHtml,
  mapSeoRouteToHydratableRoute,
};
