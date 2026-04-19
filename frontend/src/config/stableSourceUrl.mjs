/**
 * Shared source-link normalization used by both the React runtime and the
 * build-time SEO/static HTML pipeline.
 *
 * The original `sourceUrl` values in the catalog data are provenance links
 * captured during mirroring. Some agencies later reshuffle or gate those URLs
 * in ways that create crawler-only 4xx noise. We only rewrite to destinations
 * we have a stable, high-confidence pattern for; everything else falls back to
 * a known-200 agency hub instead of guessing a per-form landing page.
 */

const HOSTS_WITH_CRAWLER_NOISE = new Set([
  'www.uscis.gov',
  'www.sba.gov',
  'www.cbp.gov',
  'www.fema.gov',
  'www.dol.gov',
  'www.osha.gov',
  'www.va.gov',
  'its.ny.gov',
  'www.uniformlaws.org',
]);

const AGENCY_FORMS_HUB = {
  'www.uscis.gov': 'https://www.uscis.gov/forms/all-forms',
  'www.sba.gov': 'https://www.sba.gov/document',
  'www.cbp.gov': 'https://www.cbp.gov/newsroom/publications/forms',
  'www.fema.gov': 'https://www.fema.gov/grants/management/applicants/forms',
  'www.dol.gov': 'https://www.dol.gov/general/forms',
  'www.osha.gov': 'https://www.osha.gov/forms',
  'www.va.gov': 'https://www.va.gov/find-forms/',
  'its.ny.gov': 'https://its.ny.gov/electronic-signatures-and-records-act-esra-regulation',
  'www.uniformlaws.org': 'https://www.uniformlaws.org/',
};

function derivePerFormLanding(host, formNumber) {
  const fn = (formNumber || '').trim();
  if (!fn) return null;

  // USCIS exposes stable per-form routes like /i-130 and /n-400.
  if (host === 'www.uscis.gov') {
    const slug = fn.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (/^[a-z]+-\d+/.test(slug)) {
      return `https://www.uscis.gov/${slug}`;
    }
    return null;
  }

  // VA redirects these "about-form-*" URLs to the stable public form page.
  if (host === 'www.va.gov') {
    const match = fn.match(/^(?:VA\s+)?([0-9]+[a-z0-9-]*)/i);
    if (match?.[1]) {
      return `https://www.va.gov/find-forms/about-form-${match[1].toLowerCase()}/`;
    }
    return null;
  }

  // SBA and CBP slugs are not predictable enough to synthesize safely.
  return null;
}

export function getStableSourceUrl({ sourceUrl, formNumber }) {
  if (!sourceUrl) return sourceUrl;

  let host;
  try {
    host = new URL(sourceUrl).host.toLowerCase();
  } catch {
    return sourceUrl;
  }

  if (!HOSTS_WITH_CRAWLER_NOISE.has(host)) {
    return sourceUrl;
  }

  const perFormLanding = derivePerFormLanding(host, formNumber);
  if (perFormLanding) {
    return perFormLanding;
  }

  return AGENCY_FORMS_HUB[host] || sourceUrl;
}

export function getStableSourceLabel(stableUrl) {
  try {
    return new URL(stableUrl).host.replace(/^www\./, '');
  } catch {
    return stableUrl;
  }
}
