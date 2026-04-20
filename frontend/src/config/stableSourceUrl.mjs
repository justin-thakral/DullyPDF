/**
 * Shared source-link normalization used by both the React runtime and the
 * build-time SEO/static HTML pipeline.
 *
 * The catalog stores upstream provenance URLs, but the public site should only
 * emit external links that stay clean in crawler reports. Some agencies still
 * bot-block every public route, while others serve a usable resource only
 * behind an old redirect. This helper keeps the output conservative:
 * - rewrite to a known canonical URL when we have one,
 * - suppress the outbound link when the host still shows crawler-only 4xxs,
 * - otherwise preserve the original source URL.
 */

// Some agency hosts crawler-block the per-PDF /sites/default/files/... URLs
// that live in the catalog metadata. Map them to safer canonical URLs so
// outbound links in SEO-indexed pages always resolve cleanly: either a
// predictable per-form route (USCIS, VA) or a conservative agency hub.
const SAFE_AGENCY_HUBS = {
  'www.cbp.gov': 'https://www.cbp.gov/newsroom/publications/forms',
  'www.sba.gov': 'https://www.sba.gov/document',
  'www.fema.gov': 'https://www.fema.gov/forms',
  'www.osha.gov': 'https://www.osha.gov/forms',
};

const EXACT_SOURCE_URL_REPLACEMENTS = {
  // VA moved this form off the older VBA PDF path and the legacy file now
  // redirects through an inconsistent filename.
  'https://www.vba.va.gov/pubs/forms/VBA-28-8832-ARE.pdf': 'https://www.va.gov/find-forms/about-form-27-8832/',
};

function normalizeKnownRedirectSourceUrl(sourceUrl) {
  let parsed;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }

  if (parsed.host.toLowerCase() === 'www.gsa.gov' && parsed.pathname.startsWith('/cdnstatic/')) {
    parsed.pathname = parsed.pathname.replace(/^\/cdnstatic\//, '/system/files/');
    return parsed.toString();
  }

  return sourceUrl;
}

function normalizeUscisFormSlug(formNumber) {
  const fn = (formNumber || '').trim();
  if (!fn) return null;
  // Accept "I-130", "i 130", "I130", etc. → "i-130"
  const match = fn.match(/^([a-z]+)[-\s]*([0-9][a-z0-9-]*)$/i);
  if (match) {
    return `${match[1].toLowerCase()}-${match[2].toLowerCase()}`;
  }
  return fn.toLowerCase().replace(/\s+/g, '-');
}

function normalizeVaFormSlug(formNumber) {
  const fn = (formNumber || '').trim();
  if (!fn) return null;
  const match = fn.match(/^(?:VA\s+)?([0-9]+[a-z0-9-]*)/i);
  return match?.[1] ? match[1].toLowerCase() : null;
}

function derivePerFormLanding(host, formNumber) {
  if (host === 'www.uscis.gov') {
    const slug = normalizeUscisFormSlug(formNumber);
    return slug ? `https://www.uscis.gov/${slug}` : null;
  }
  if (host === 'www.va.gov') {
    const slug = normalizeVaFormSlug(formNumber);
    return slug ? `https://www.va.gov/find-forms/about-form-${slug}/` : null;
  }
  return null;
}

export function getStableSourceUrl({ sourceUrl, formNumber }) {
  if (!sourceUrl) return null;

  const exactReplacement = EXACT_SOURCE_URL_REPLACEMENTS[sourceUrl];
  if (exactReplacement) {
    return exactReplacement;
  }

  const normalizedSourceUrl = normalizeKnownRedirectSourceUrl(sourceUrl);

  let parsed;
  try {
    parsed = new URL(normalizedSourceUrl);
  } catch {
    return normalizedSourceUrl;
  }
  const host = parsed.host.toLowerCase();

  // VA already exposes stable public form pages under /forms/{id}/ and
  // /find-forms/about-form-{id}/. Preserve those canonical URLs as-is
  // instead of re-deriving from the display-facing form number.
  if (
    host === 'www.va.gov'
    && (parsed.pathname.startsWith('/forms/') || parsed.pathname.startsWith('/find-forms/'))
  ) {
    return normalizedSourceUrl;
  }

  const perFormLanding = derivePerFormLanding(host, formNumber);
  if (perFormLanding) {
    return perFormLanding;
  }

  const safeHub = SAFE_AGENCY_HUBS[host];
  if (safeHub) {
    return safeHub;
  }

  return normalizedSourceUrl;
}

export function getStableSourceLabel(stableUrl) {
  try {
    return new URL(stableUrl).host.replace(/^www\./, '');
  } catch {
    return stableUrl;
  }
}
