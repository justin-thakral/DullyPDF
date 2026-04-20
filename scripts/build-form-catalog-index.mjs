#!/usr/bin/env node
/**
 * Build the Form Catalog index consumed by the frontend.
 *
 * Reads:
 *   form_catalog/manifest.json       — scraper output / rebuilt on-disk catalog
 *   form_catalog/descriptions.json   — optional `{ _entries: { "section/filename": { description, useCase } } }`
 *   form_catalog/page_counts.json    — sha256-keyed cache of pdfjs page counts (regenerated on first run)
 *
 * Writes:
 *   frontend/src/config/formCatalogData.mjs         — entries array + by-slug index
 *   frontend/src/config/formCatalogCategories.mjs   — category metadata + counts
 *   frontend/src/config/formCatalogExternalSources.mjs — restricted categories + external source links
 *   form_catalog/page_counts.json                   — sha256 → numPages cache (updated in place)
 *
 * Run manually or via deploy-frontend.sh before the Vite build. The generated files
 * are committed so Vitest/SSR/dev builds work without a prebuild step.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());
const MANIFEST_PATH = resolve(ROOT, 'form_catalog/manifest.json');
const DESCRIPTIONS_PATH = resolve(ROOT, 'form_catalog/descriptions.json');
const TITLE_OVERRIDES_PATH = resolve(ROOT, 'form_catalog/title_overrides.json');
const PAGE_COUNTS_PATH = resolve(ROOT, 'form_catalog/page_counts.json');
const CATALOG_ROOT = resolve(ROOT, 'form_catalog');
const OUT_DATA = resolve(ROOT, 'frontend/src/config/formCatalogData.mjs');
const OUT_CATEGORIES = resolve(ROOT, 'frontend/src/config/formCatalogCategories.mjs');
const OUT_EXTERNAL_SOURCES = resolve(ROOT, 'frontend/src/config/formCatalogExternalSources.mjs');
const OUT_SLUG_REDIRECTS = resolve(ROOT, 'form_catalog/slug_redirects.json');

const CATEGORY_LABELS = {
  acord: 'ACORD (Insurance)',
  bankruptcy: 'Bankruptcy',
  civil_litigation: 'Federal Civil Litigation',
  contracts_procurement: 'Contracts & Procurement',
  criminal_justice: 'Federal Criminal',
  customs_logistics: 'Customs & Logistics',
  disaster_emergency: 'Disaster Recovery & FEMA',
  federal_specialized: 'Federal — Specialized Agencies',
  healthcare: 'Healthcare & Medicine',
  hipaa: 'HIPAA',
  hr_onboarding: 'HR & Onboarding',
  immigration: 'Immigration & USCIS',
  labor_employment: 'Labor & Employment',
  nar_realtor: 'NAR / Realtor',
  nonprofit: 'Nonprofit',
  patient_intake: 'Patient Health & Appeals',
  practice_intake: 'Practice Intake Templates',
  real_estate_housing: 'Real Estate & Housing',
  small_business: 'Small Business',
  social_security: 'Social Security',
  state_courts: 'State Courts',
  state_department: 'State Department (DS forms)',
  state_dmv: 'State DMV & Vehicle',
  state_labor: 'State Labor & Unemployment',
  state_licensing: 'State Professional Licensing',
  state_tax: 'State Tax & Revenue',
  tax_business: 'Tax — Business',
  tax_individual: 'Tax — Individual',
  tax_payroll: 'Tax — Payroll',
  veterans: 'Veterans (VA)',
};

const EMPTY_CATEGORY_REASONS = {
  acord: 'Copyright-restricted. See form_catalog/acord/links.txt for official ACORD sources.',
  contracts_procurement: 'Hosted forms were pruned from the public catalog. See form_catalog/contracts_procurement/links.txt for official GSA sources.',
  criminal_justice: 'Hosted forms were pruned from the public catalog. See form_catalog/criminal_justice/links.txt for official U.S. Courts sources.',
  hipaa: 'HIPAA source forms are linked externally. See form_catalog/hipaa/links.txt.',
  nar_realtor: 'NAR / Realtor forms are copyright-restricted. See form_catalog/nar_realtor/links.txt.',
};

const EXTERNAL_SOURCE_FILES = {
  acord: 'form_catalog/acord/links.txt',
  contracts_procurement: 'form_catalog/contracts_procurement/links.txt',
  criminal_justice: 'form_catalog/criminal_justice/links.txt',
  hipaa: 'form_catalog/hipaa/links.txt',
  nar_realtor: 'form_catalog/nar_realtor/links.txt',
};

// Public browse categories are allowed to aggregate multiple source sections
// when they represent one real-world workflow family. Healthcare is the only
// grouped bucket today so provider-side Medicare forms and patient-health
// packets stay discoverable under one tab.
const CATEGORY_SECTION_GROUPS = {
  healthcare: ['healthcare', 'patient_intake'],
};

const SECTION_DESCRIPTION_FALLBACKS = {
  bankruptcy: 'bankruptcy petitions, schedules, claims, reaffirmation, and chapter-plan workflows',
  civil_litigation: 'federal civil complaints, fee waivers, summonses, subpoenas, magistrate-consent, judgment, and pro se litigation workflows',
  contracts_procurement: 'federal procurement, solicitation, contract modification, and vendor payment setup workflows',
  criminal_justice: 'criminal complaints, warrants, subpoenas, bonds, judgments, and supervision workflows',
  customs_logistics: 'customs, cargo, vessel, traveler, and import/export workflows',
  disaster_emergency: 'FEMA public assistance, flood insurance, map revision, damage, and recovery workflows',
  federal_specialized: 'FAA, FCC, OSHA, EPA, NLRB, CPSC, USDA, USPS, and other specialized federal agency workflows',
  healthcare: 'Medicare, VA health benefits, provider enrollment, claims, patient intake, and appeals workflows',
  hr_onboarding: 'hiring, withholding, personnel-security, benefits, and onboarding workflows',
  immigration: 'immigration petitions, applications, and status workflows',
  labor_employment: 'leave, workers compensation, federal employment screening, and workplace safety workflows',
  nonprofit: 'nonprofit tax exemption, excise tax, and reporting workflows',
  patient_intake: 'patient enrollment, coverage, consent, complaint, and appeals workflows',
  practice_intake: 'first-party medical, specialty, therapy, wellness, telehealth, imaging, fertility, and office intake workflows',
  real_estate_housing: 'HUD housing, USDA rural housing, mortgage, community development, and property workflows',
  small_business: 'SBA lending, certification, servicing, and compliance workflows',
  state_courts: 'state court civil, small claims, family law, probate, and landlord-tenant workflows across all 50 states',
  state_department: 'passport, visa, citizenship, consular, and State Department personnel workflows',
  state_dmv: 'state motor vehicle title transfer, registration renewal, driver license, and DMV workflows across all 50 states',
  state_labor: 'state unemployment insurance, wage claim, new-hire reporting, and workforce agency workflows across all 50 states',
  state_licensing: 'state professional licensing applications and renewals (nursing, bar, contractor, real estate, cosmetology) across all 50 states',
  state_tax: 'state income tax, sales and use tax, withholding, franchise tax, and revenue department workflows across all 50 states',
  tax_business: 'business, estate, trust, and exempt-organization tax workflows',
  tax_individual: 'individual federal tax filing workflows',
  tax_payroll: 'payroll, withholding, and benefit-plan reporting workflows',
  veterans: 'VA claims, appeals, pension, education, housing, debt, insurance, and memorial workflows',
};

const PATIENT_INTAKE_FORM_NUMBERS = new Set([
  '10-10D',
  '10-10EZ',
  '10-10EZR',
  '10-5345',
  '10-5345A',
  '10-7959A',
  '10-7959C',
  'CMS-10114',
  'CMS-10125',
  'CMS-1500',
  'CMS-20031',
  'CMS-20134',
  'CMS-4040',
  'VA 21-0779',
  'VA 21-0845',
  'VA 21-2680',
  'VA 21-4142',
  'VA 21-4142A',
  'VA 21P-8416',
]);

function slugify(raw) {
  return String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function buildSlug(entry, usedSlugs) {
  const formNumberSlug = slugify(entry.form_number || '');
  if (formNumberSlug && !usedSlugs.has(formNumberSlug)) {
    usedSlugs.add(formNumberSlug);
    return formNumberSlug;
  }
  if (formNumberSlug && entry.year) {
    const yearSlug = slugify(`${entry.form_number}-${entry.year}`);
    if (yearSlug && !usedSlugs.has(yearSlug)) {
      usedSlugs.add(yearSlug);
      return yearSlug;
    }
  }
  const base =
    formNumberSlug ||
    slugify(entry.filename.replace(/\.pdf$/i, '')) ||
    entry.sha256?.slice(0, 12) ||
    'form';
  const suffix = entry.sha256 ? entry.sha256.slice(0, 8) : Math.random().toString(36).slice(2, 10);
  const disambiguated = `${base}-${suffix}`;
  usedSlugs.add(disambiguated);
  return disambiguated;
}

// Replicates the pre-2026-04 slug shape so we can emit 301 redirects for
// already-indexed URLs. Do not change: old slugs Google has already crawled
// must remain mappable or we lose whatever link equity they have.
function computeLegacySlug(entry, usedSlugs) {
  const baseSource = `${entry.form_number || ''}-${entry.filename.replace(/\.pdf$/i, '')}`;
  const base = slugify(baseSource) || slugify(entry.filename) || entry.sha256?.slice(0, 12) || 'form';
  if (!usedSlugs.has(base)) {
    usedSlugs.add(base);
    return base;
  }
  const suffix = entry.sha256 ? entry.sha256.slice(0, 8) : 'legacy';
  const disambiguated = `${base}-${suffix}`;
  usedSlugs.add(disambiguated);
  return disambiguated;
}

function isPriorYearClone(entry) {
  // Prior-year scraper leaves low-quality titles like "w 4  2023 w4"
  const title = String(entry.title || '').trim();
  return /^[\sa-z0-9-]+$/.test(title) && !/[A-Z]/.test(title) && entry.is_prior_year === true;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadDescriptions() {
  if (!existsSync(DESCRIPTIONS_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(DESCRIPTIONS_PATH, 'utf8'));
    return raw?._entries && typeof raw._entries === 'object' ? raw._entries : {};
  } catch (error) {
    console.warn(`[build-form-catalog-index] Could not parse ${DESCRIPTIONS_PATH}:`, error.message);
    return {};
  }
}

function loadTitleOverrides() {
  if (!existsSync(TITLE_OVERRIDES_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(TITLE_OVERRIDES_PATH, 'utf8'));
    return raw?._entries && typeof raw._entries === 'object' ? raw._entries : {};
  } catch (error) {
    console.warn(`[build-form-catalog-index] Could not parse ${TITLE_OVERRIDES_PATH}:`, error.message);
    return {};
  }
}

function loadPageCountCache() {
  if (!existsSync(PAGE_COUNTS_PATH)) return {};
  try {
    const raw = JSON.parse(readFileSync(PAGE_COUNTS_PATH, 'utf8'));
    return raw && typeof raw === 'object' && raw._entries && typeof raw._entries === 'object'
      ? raw._entries
      : {};
  } catch (error) {
    console.warn(`[build-form-catalog-index] Could not parse ${PAGE_COUNTS_PATH}:`, error.message);
    return {};
  }
}

function savePageCountCache(cache) {
  const payload = {
    _note: 'Keyed by sha256 of each downloaded PDF. Regenerated automatically when a new PDF is scraped.',
    _entries: Object.fromEntries(
      Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  writeFileSync(PAGE_COUNTS_PATH, `${JSON.stringify(payload, null, 2)}\n`);
}

// pdfjs-dist is installed under frontend/node_modules, not the repo root, so
// resolve its legacy ESM bundle by absolute path.
const PDFJS_MODULE_PATH = resolve(ROOT, 'frontend/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
let pdfjsModulePromise = null;
function loadPdfjs() {
  if (!pdfjsModulePromise) {
    if (!existsSync(PDFJS_MODULE_PATH)) {
      throw new Error(
        `pdfjs-dist not found at ${PDFJS_MODULE_PATH}. Run \`npm install\` in frontend/ first.`,
      );
    }
    pdfjsModulePromise = import(`file://${PDFJS_MODULE_PATH}`);
  }
  return pdfjsModulePromise;
}

async function readPdfPageCount(filePath) {
  const pdfjs = await loadPdfjs();
  const buffer = readFileSync(filePath);
  const data = new Uint8Array(buffer);
  const task = pdfjs.getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    disableFontFace: true,
    stopAtErrors: false,
  });
  try {
    const doc = await task.promise;
    try {
      return Number.isFinite(doc.numPages) ? doc.numPages : null;
    } finally {
      try {
        await doc.destroy();
      } catch {
        // best-effort cleanup
      }
    }
  } catch {
    return null;
  }
}

async function resolvePageCounts(okForms) {
  const cache = loadPageCountCache();
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const entry of okForms) {
    const key = entry.sha256;
    if (!key) {
      failed += 1;
      continue;
    }
    if (Number.isFinite(cache[key])) {
      skipped += 1;
      continue;
    }
    const filePath = resolve(CATALOG_ROOT, entry.section, entry.filename);
    if (!existsSync(filePath)) {
      failed += 1;
      continue;
    }
    const pageCount = await readPdfPageCount(filePath);
    if (pageCount && pageCount > 0) {
      cache[key] = pageCount;
      added += 1;
    } else {
      failed += 1;
    }
  }
  if (added > 0) {
    savePageCountCache(cache);
  }
  console.log(
    `[build-form-catalog-index] page counts: ${skipped} cached, ${added} new, ${failed} failed`,
  );
  return cache;
}

function parseExternalSourceLinks(rawText) {
  const links = [];
  const seenUrls = new Set();
  let pendingLabel = '';

  for (const line of String(rawText || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      pendingLabel = '';
      continue;
    }
    if (/^[=-]{3,}$/.test(trimmed)) continue;

    const urlMatch = trimmed.match(/https?:\/\/\S+/i);
    if (!urlMatch) {
      if (
        /^status:/i.test(trimmed)
        || /^\d+\.\s/.test(trimmed)
        || /^using dullypdf/i.test(trimmed)
        || /^common /i.test(trimmed)
        || /^related /i.test(trimmed)
        || /^where to get/i.test(trimmed)
        || /^official /i.test(trimmed)
        || /^state realtor/i.test(trimmed)
      ) {
        pendingLabel = '';
        continue;
      }
      pendingLabel = trimmed;
      continue;
    }

    const url = urlMatch[0];
    if (seenUrls.has(url)) {
      pendingLabel = '';
      continue;
    }

    const inlineLabel = trimmed.slice(0, urlMatch.index).trim().replace(/[–—:.-\s]+$/g, '');
    links.push({
      label: inlineLabel || pendingLabel || url,
      url,
    });
    seenUrls.add(url);
    pendingLabel = '';
  }

  return links;
}

function buildExternalSources() {
  const sources = {};
  for (const [categoryKey, relativePath] of Object.entries(EXTERNAL_SOURCE_FILES)) {
    const absolutePath = resolve(ROOT, relativePath);
    if (!existsSync(absolutePath)) {
      console.warn(`[build-form-catalog-index] Missing external source list: ${absolutePath}`);
      continue;
    }
    sources[categoryKey] = {
      key: categoryKey,
      label: CATEGORY_LABELS[categoryKey] || categoryKey,
      sourceFile: relativePath,
      links: parseExternalSourceLinks(readFileSync(absolutePath, 'utf8')),
    };
  }
  return sources;
}

function resolveEntryYear(entry) {
  if (Number.isInteger(entry.year) && entry.year > 1900) return entry.year;
  const filenameMatch = String(entry.filename || '').match(/__(\d{4})_[^/]+\.pdf$/i);
  if (filenameMatch) return Number(filenameMatch[1]);
  const formNumberMatch = String(entry.form_number || '').match(/__(\d{4})_[^/]+$/i);
  if (formNumberMatch) return Number(formNumberMatch[1]);
  const titleMatch = String(entry.title || '').match(/\b(20\d{2})\b/);
  if (titleMatch) return Number(titleMatch[1]);
  return null;
}

function extractFilenameLookupCode(entry) {
  const filename = String(entry.filename || '');
  if (!filename) return '';
  const priorYearMatch = filename.match(/__\d{4}_([a-z0-9-]+)\.pdf$/i);
  if (priorYearMatch) return priorYearMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '');
  const currentMatch = filename.match(/__f?([a-z0-9-]+)\.pdf$/i);
  if (currentMatch) return currentMatch[1].toLowerCase().replace(/[^a-z0-9]+/g, '');
  return '';
}

function isGeneratedFormNumber(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return false;
  return /__\d{4}_/i.test(trimmed) || (/^[a-z0-9_-]+$/i.test(trimmed) && /__/.test(trimmed));
}

function humaniseGeneratedIdentifier(value) {
  const source = String(value || '').trim();
  if (!source) return '';
  return source
    .split(/\s+/)
    .join(' ')
    .replace(/__/g, ' ')
    .replace(/_schedule_/gi, ' Schedule ')
    .replace(/_/g, ' ')
    .replace(/\b(schedule)\b/gi, 'Schedule')
    .replace(/\b([a-z]{1,4})\b/gi, (token) => token.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

function buildFallbackTitleFromFormNumber(formNumber) {
  const trimmed = String(formNumber || '').trim();
  if (!trimmed) return 'Untitled form';
  const hudMatch = trimmed.match(/^HUD-(.+)$/i);
  if (hudMatch) return `HUD Form ${hudMatch[1]}`;
  const cbpMatch = trimmed.match(/^CBP\s+(.+)$/i);
  if (cbpMatch) return `CBP Form ${cbpMatch[1]}`;
  const vaMatch = trimmed.match(/^VA\s+(.+)$/i);
  if (vaMatch) return `VA Form ${vaMatch[1]}`;
  const cmsMatch = trimmed.match(/^CMS-(.+)$/i);
  if (cmsMatch) return `CMS Form ${cmsMatch[1]}`;
  const dsMatch = trimmed.match(/^DS-(.+)$/i);
  if (dsMatch) return `DS Form ${dsMatch[1]}`;
  const oshaMatch = trimmed.match(/^OSHA\s+(.+)$/i);
  if (oshaMatch) return `OSHA Form ${oshaMatch[1]}`;
  const whMatch = trimmed.match(/^WH-(.+)$/i);
  if (whMatch) return `WH Form ${whMatch[1]}`;
  return /\bform\b/i.test(trimmed) ? trimmed : `Form ${trimmed}`;
}

function formReference(entry) {
  const formNumber = String(entry.form_number || '').trim();
  if (!formNumber) return 'this form';
  return /\bform\b/i.test(formNumber) ? formNumber : `Form ${formNumber}`;
}

function trimTrailingPunctuation(value) {
  return String(value || '').trim().replace(/[.?!:;\s]+$/g, '');
}

function stripKnownTitlePrefixes(title) {
  return String(title || '')
    .trim()
    .replace(/^CBP Form\s+[A-Z0-9-]+\s*-\s*/i, '')
    .replace(/^SBA Form\s+[A-Z0-9-]+\s*-\s*/i, '')
    .replace(/^SBA Form\s*-\s*/i, '')
    .replace(/^Form\s+[A-Z0-9-]+\s*-\s*/i, '')
    .trim();
}

function stripRedundantFormPrefix(title, formNumber) {
  const trimmedTitle = String(title || '').trim();
  const trimmedFormNumber = String(formNumber || '').trim();
  if (!trimmedTitle || !trimmedFormNumber) return trimmedTitle;

  const patterns = [
    new RegExp(`^${escapeRegExp(trimmedFormNumber)}\\s*[-:]\s*`, 'i'),
    new RegExp(`^Form\\s+${escapeRegExp(trimmedFormNumber)}\\s*[-:]\s*`, 'i'),
  ];

  const agencyMatch = trimmedFormNumber.match(/^([A-Z]{2,})[-\s]+(.+)$/);
  if (agencyMatch) {
    const [, agency, rest] = agencyMatch;
    patterns.push(new RegExp(`^${escapeRegExp(agency)}\\s+Form\\s+${escapeRegExp(rest)}\\s*[-:]\s*`, 'i'));
  }

  for (const pattern of patterns) {
    const stripped = trimmedTitle.replace(pattern, '').trim();
    if (stripped && stripped !== trimmedTitle) return stripped;
  }
  return trimmedTitle;
}

function normaliseComparableCode(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/^sba\s+form\s+/i, '')
    .replace(/^cbp\s+form\s+/i, '')
    .replace(/^form\s+/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

function toSentencePhrase(title) {
  return String(title || '')
    .split(/(\s+)/)
    .map((chunk) => {
      if (!chunk || /^\s+$/.test(chunk)) return chunk;
      const match = chunk.match(/^([^A-Za-z0-9]*)([A-Za-z][A-Za-z'/-]*)([^A-Za-z0-9]*)$/);
      if (!match) return chunk;
      const [, prefix, word, suffix] = match;
      if (/^[A-Z][a-z]+(?:['/-][A-Za-z]+)*$/.test(word)) {
        return `${prefix}${word.toLowerCase()}${suffix}`;
      }
      return chunk;
    })
    .join('');
}

function isUsefulDescriptionTitle(entry, title) {
  const cleaned = stripKnownTitlePrefixes(title);
  if (!cleaned) return false;
  if (/^\d[\dA-Za-z .()/-]*$/.test(cleaned) && !/[a-z]{3,}/i.test(cleaned)) return false;
  if (/^[A-Z0-9 .()/-]+$/.test(cleaned) && !/[A-Z][a-z]{2,}/.test(cleaned) && !/[a-z]{3,}/.test(cleaned)) return false;
  if (/\d/.test(cleaned) && cleaned.split(/\s+/).length <= 3 && !/[a-z]{4,}/i.test(cleaned)) return false;

  const titleCode = normaliseComparableCode(cleaned);
  const formCode = normaliseComparableCode(entry.form_number);
  if (titleCode && formCode && (titleCode === formCode || titleCode.startsWith(formCode) || formCode.startsWith(titleCode))) {
    return false;
  }
  return true;
}

function buildCurrentTitleLookup(forms) {
  const lookup = new Map();
  for (const entry of forms) {
    if (entry.is_prior_year) continue;
    const code = extractFilenameLookupCode(entry);
    if (!code) continue;
    const rawFormNumber = String(entry.form_number || '').trim();
    if (!rawFormNumber || isGeneratedFormNumber(rawFormNumber)) continue;
    const rawTitle = stripRedundantFormPrefix(String(entry.title || '').trim(), rawFormNumber);
    if (!rawTitle || !isUsefulDescriptionTitle(entry, rawTitle)) continue;
    lookup.set(code, {
      formNumber: rawFormNumber,
      title: rawTitle,
    });
  }
  return lookup;
}

function normaliseCatalogIdentity(entry, currentTitleLookup, titleOverrides) {
  const descriptionKey = `${entry.section}/${entry.filename}`;
  const metadataOverride = titleOverrides[descriptionKey] && typeof titleOverrides[descriptionKey] === 'object'
    ? titleOverrides[descriptionKey]
    : {};
  const overrideTitle = String(metadataOverride.title || '').trim();
  const overrideFormNumber = String(metadataOverride.formNumber || '').trim();
  const rawTitle = String(entry.title || '').trim();
  const rawFormNumber = String(entry.form_number || '').trim();
  const year = resolveEntryYear(entry);
  const lookup = entry.is_prior_year ? currentTitleLookup.get(extractFilenameLookupCode(entry)) || null : null;

  let formNumber = overrideFormNumber || rawFormNumber;
  if ((!formNumber || isGeneratedFormNumber(formNumber)) && lookup?.formNumber) {
    formNumber = lookup.formNumber;
  } else if (isGeneratedFormNumber(formNumber)) {
    formNumber = humaniseGeneratedIdentifier(formNumber.split('__')[0]);
  }

  let title = overrideTitle || stripRedundantFormPrefix(rawTitle, formNumber || rawFormNumber);
  if (overrideTitle) {
    title = overrideTitle;
  } else if (entry.is_prior_year && lookup?.title) {
    title = lookup.title;
  } else if (!title || !isUsefulDescriptionTitle({ ...entry, form_number: formNumber, year }, title)) {
    title = buildFallbackTitleFromFormNumber(formNumber);
  }

  if (entry.is_prior_year && year && title && !/\b20\d{2}\b/.test(title)) {
    title = `${title} (${year})`;
  }

  return {
    formNumber,
    title,
    year,
  };
}

function buildDescriptionFromTitle(entry, title) {
  const formRef = formReference(entry);
  const phrase = trimTrailingPunctuation(toSentencePhrase(stripKnownTitlePrefixes(title)));
  if (!phrase) return '';

  const patterns = [
    [/^application for (.+)$/i, (match) => `Use ${formRef} to apply for ${match[1]}.`],
    [/^application to (.+)$/i, (match) => `Use ${formRef} to apply to ${match[1]}.`],
    [/^petition for (.+)$/i, (match) => `Use ${formRef} to petition for ${match[1]}.`],
    [/^request for (.+)$/i, (match) => `Use ${formRef} to request ${match[1]}.`],
    [/^request to (.+)$/i, (match) => `Use ${formRef} to request ${match[1]}.`],
    [/^statement in support of (.+)$/i, (match) => `Use ${formRef} to provide a statement in support of ${match[1]}.`],
    [/^statement of (.+)$/i, (match) => `Use ${formRef} to provide a statement of ${match[1]}.`],
    [/^statement regarding (.+)$/i, (match) => `Use ${formRef} to provide a statement regarding ${match[1]}.`],
    [/^authorization to (.+)$/i, (match) => `Use ${formRef} to authorize ${match[1]}.`],
    [/^authorization for (.+)$/i, (match) => `Use ${formRef} to authorize ${match[1]}.`],
    [/^notice of (.+)$/i, (match) => `Use ${formRef} to file a notice of ${match[1]}.`],
    [/^report and certification of (.+)$/i, (match) => `Use ${formRef} to report and certify ${match[1]}.`],
    [/^report of (.+)$/i, (match) => `Use ${formRef} to report ${match[1]}.`],
    [/^certification - (.+)$/i, (match) => `Use ${formRef} to certify ${match[1]}.`],
    [/^certification of (.+)$/i, (match) => `Use ${formRef} to certify ${match[1]}.`],
    [/^waiver of (.+)$/i, (match) => `Use ${formRef} to waive ${match[1]}.`],
    [/^affidavit of (.+)$/i, (match) => `Use ${formRef} to provide an affidavit of ${match[1]}.`],
    [/^appointment of (.+)$/i, (match) => `Use ${formRef} to appoint ${match[1]}.`],
    [/^designation of (.+)$/i, (match) => `Use ${formRef} to designate ${match[1]}.`],
    [/^record of (.+)$/i, (match) => `Use ${formRef} to record ${match[1]}.`],
    [/^log of (.+)$/i, (match) => `Use ${formRef} to log ${match[1]}.`],
    [/^verification request$/i, () => `Use ${formRef} to request verification.`],
  ];

  for (const [pattern, builder] of patterns) {
    const match = phrase.match(pattern);
    if (match) {
      return builder(match);
    }
  }

  return `Use ${formRef} for ${phrase}.`;
}

function buildAutoDescription(entry, title) {
  if (isUsefulDescriptionTitle(entry, title)) {
    const titleDescription = buildDescriptionFromTitle(entry, title);
    if (titleDescription) {
      if (entry.is_prior_year && entry.year) {
        return `${titleDescription} This is the ${entry.year} prior-year edition.`;
      }
      return titleDescription;
    }
  }

  const formRef = formReference(entry);
  const sectionHint = SECTION_DESCRIPTION_FALLBACKS[entry.section] || 'document workflows';
  const base = `${formRef} is a public-domain federal PDF used in ${sectionHint}.`;
  if (entry.is_prior_year && entry.year) {
    return `${base} This is the ${entry.year} prior-year edition.`;
  }
  return base;
}

function resolveCatalogSection(rawEntry) {
  if (rawEntry.section === 'patient_intake') {
    return 'patient_intake';
  }
  const formNumber = String(rawEntry.form_number || '').trim();
  if (PATIENT_INTAKE_FORM_NUMBERS.has(formNumber)) {
    return 'patient_intake';
  }
  return rawEntry.section;
}

function resolveCategorySections(key) {
  const groupedSections = CATEGORY_SECTION_GROUPS[key];
  if (Array.isArray(groupedSections) && groupedSections.length > 0) {
    return [...new Set(groupedSections)];
  }
  return [key];
}

function buildEntry(rawEntry, descriptionsLookup, pageCountCache, currentTitleLookup, titleOverrides, usedSlugs, legacyUsedSlugs) {
  const descriptionKey = `${rawEntry.section}/${rawEntry.filename}`;
  const desc = descriptionsLookup[descriptionKey] || {};
  const catalogSection = resolveCatalogSection(rawEntry);
  const identity = normaliseCatalogIdentity(rawEntry, currentTitleLookup, titleOverrides);
  const normalizedEntry = {
    ...rawEntry,
    form_number: identity.formNumber,
    section: catalogSection,
    year: identity.year,
  };
  // Slug uses normalized form_number + year so prior-year "1040__2023_1040"
  // garbage from the disk-rebuild scraper produces clean "1040-2023", not a
  // duplicated mess. Legacy slug uses rawEntry so the 301 source matches the
  // URL Google already indexed.
  const slug = buildSlug(normalizedEntry, usedSlugs);
  const legacySlug = legacyUsedSlugs ? computeLegacySlug(rawEntry, legacyUsedSlugs) : null;
  const title = identity.title;
  const description = desc.description || buildAutoDescription(normalizedEntry, title);
  const cachedPageCount = rawEntry.sha256 ? pageCountCache[rawEntry.sha256] : null;
  const pageCount = Number.isFinite(cachedPageCount) && cachedPageCount > 0 ? cachedPageCount : null;
  return {
    slug,
    legacySlug,
    formNumber: identity.formNumber,
    title,
    section: catalogSection,
    sourceSection: rawEntry.section,
    filename: rawEntry.filename,
    year: identity.year,
    isPriorYear: Boolean(rawEntry.is_prior_year),
    sourceUrl: rawEntry.url,
    bytes: rawEntry.bytes ?? null,
    sha256: rawEntry.sha256 || null,
    pageCount,
    pdfPath: `${rawEntry.section}/${rawEntry.filename}`,
    thumbnailPath: `${rawEntry.section}/${rawEntry.filename.replace(/\.pdf$/i, '.webp')}`,
    description,
    useCase: desc.useCase || '',
  };
}

async function main() {
  if (!existsSync(MANIFEST_PATH)) {
    throw new Error(`Missing manifest at ${MANIFEST_PATH}. Run form_catalog/scraper.py first.`);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const descriptions = loadDescriptions();
  const titleOverrides = loadTitleOverrides();

  const rawForms = Array.isArray(manifest?.forms) ? manifest.forms : [];
  const okForms = rawForms.filter((f) => f?.ok === true && f.section && f.filename);

  const pageCountCache = await resolvePageCounts(okForms);
  // Prior-year IRS files rebuilt from disk often only preserve filename-like slugs.
  // Reuse the current-year title/form-number pair when the PDF code matches.
  const currentTitleLookup = buildCurrentTitleLookup(okForms);

  // Group by section; sort within each section by form_number for deterministic output.
  const bySection = new Map();
  for (const f of okForms) {
    if (!bySection.has(f.section)) bySection.set(f.section, []);
    bySection.get(f.section).push(f);
  }
  for (const list of bySection.values()) {
    list.sort((a, b) => {
      const an = String(a.form_number || a.filename);
      const bn = String(b.form_number || b.filename);
      return an.localeCompare(bn, 'en', { numeric: true, sensitivity: 'base' });
    });
  }

  const usedSlugs = new Set();
  const legacyUsedSlugs = new Set();
  const entries = [];
  const bySlug = {};
  const slugRedirects = [];
  for (const section of [...bySection.keys()].sort()) {
    for (const raw of bySection.get(section)) {
      const built = buildEntry(
        raw,
        descriptions,
        pageCountCache,
        currentTitleLookup,
        titleOverrides,
        usedSlugs,
        legacyUsedSlugs,
      );
      if (built.legacySlug && built.legacySlug !== built.slug) {
        slugRedirects.push({
          source: `/forms/${built.legacySlug}`,
          destination: `/forms/${built.slug}`,
          type: 301,
        });
      }
      delete built.legacySlug;
      entries.push(built);
      bySlug[built.slug] = built;
    }
  }

  // Build category list including known-empty categories for UX (greyed-out chips).
  const sectionCounts = new Map();
  for (const entry of entries) {
    sectionCounts.set(entry.section, (sectionCounts.get(entry.section) || 0) + 1);
  }
  const knownKeys = new Set([...Object.keys(CATEGORY_LABELS)]);
  for (const key of sectionCounts.keys()) knownKeys.add(key);

  const categories = [...knownKeys]
    .map((key) => {
      const sections = resolveCategorySections(key);
      const count = sections.reduce(
        (sum, sectionKey) => sum + (sectionCounts.get(sectionKey) || 0),
        0,
      );
      const empty = count === 0;
      return {
        key,
        label: CATEGORY_LABELS[key] || key.replace(/_/g, ' '),
        sections,
        count,
        empty,
        emptyReason: empty ? (EMPTY_CATEGORY_REASONS[key] || null) : null,
      };
    })
    .sort((a, b) => {
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      return b.count - a.count;
    });

  const dataHeader = `// AUTO-GENERATED by scripts/build-form-catalog-index.mjs. Do not edit by hand.
// Run \`node scripts/build-form-catalog-index.mjs\` to refresh.
`;
  // Compact JSON (one entry per line) keeps the generated module small while
  // still producing a readable git diff when entries change.
  const formatEntries = (items) => `[\n${items.map((e) => `  ${JSON.stringify(e)}`).join(',\n')}\n]`;
  const dataBody = `${dataHeader}
import { buildFormCatalogAssetUrl } from './formCatalogAssetBase.mjs';

const RAW_FORM_CATALOG_ENTRIES = ${formatEntries(entries)};

export const FORM_CATALOG_ENTRIES = RAW_FORM_CATALOG_ENTRIES.map(({ pdfPath, thumbnailPath, ...entry }) => ({
  ...entry,
  pdfUrl: buildFormCatalogAssetUrl(pdfPath),
  thumbnailUrl: buildFormCatalogAssetUrl(thumbnailPath),
}));

const bySlugLookup = Object.fromEntries(FORM_CATALOG_ENTRIES.map((entry) => [entry.slug, entry]));
export const FORM_CATALOG_BY_SLUG = bySlugLookup;

export function getFormCatalogEntryBySlug(slug) {
  if (!slug) return null;
  return bySlugLookup[slug] || null;
}
`;
  writeFileSync(OUT_DATA, dataBody);

  const formatCategories = (items) => `[\n${items.map((c) => `  ${JSON.stringify(c)}`).join(',\n')}\n]`;
  const categoriesBody = `${dataHeader}
export const FORM_CATALOG_CATEGORIES = ${formatCategories(categories)};

export const FORM_CATALOG_TOTAL_COUNT = ${entries.length};
`;
  writeFileSync(OUT_CATEGORIES, categoriesBody);

  const externalSourcesBody = `${dataHeader}
export const FORM_CATALOG_EXTERNAL_SOURCES = ${JSON.stringify(buildExternalSources(), null, 2)};
`;
  writeFileSync(OUT_EXTERNAL_SOURCES, externalSourcesBody);

  slugRedirects.sort((a, b) => a.source.localeCompare(b.source));
  writeFileSync(OUT_SLUG_REDIRECTS, `${JSON.stringify(slugRedirects, null, 2)}\n`);

  const activeCount = categories.filter((c) => !c.empty).length;
  console.log(
    `[build-form-catalog-index] ${entries.length} entries across ${activeCount} categories → ${OUT_DATA.replace(ROOT + '/', '')}`,
  );
  console.log(
    `[build-form-catalog-index] ${slugRedirects.length} legacy → new slug redirects → ${OUT_SLUG_REDIRECTS.replace(ROOT + '/', '')}`,
  );
}

main().catch((error) => {
  console.error('[build-form-catalog-index] failed:', error);
  process.exit(1);
});
