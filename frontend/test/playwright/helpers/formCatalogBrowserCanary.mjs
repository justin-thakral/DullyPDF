import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const BROWSER_CANARY_PRODUCER_VERSION = 'form-catalog-browser-canary-v1';
export const BROWSER_CANARY_REPORT_NAME = 'browser-canary-report.json';
export const DEFAULT_BROWSER_CANARY_ASSET_BASE_URL =
  'https://storage.googleapis.com/dullypdf-form-catalog-assets-east4';
export const DEFAULT_BROWSER_CANARY_VIEWPORT = Object.freeze({
  width: 1600,
  height: 1200,
});

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const HOSTING_VERSION_PATTERN =
  /^sites\/[a-z0-9][a-z0-9-]{2,62}\/versions\/[A-Za-z0-9._-]+$/;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from('%PDF-');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requiredTrimmedString(value, location) {
  assert(
    typeof value === 'string' && value.length > 0 && value === value.trim(),
    `${location} must be a non-empty trimmed string.`,
  );
  return value;
}

function requiredPositiveInteger(value, location) {
  assert(
    Number.isInteger(value) && value > 0,
    `${location} must be a positive integer.`,
  );
  return value;
}

function readJsonObject(filePath, label) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read ${label} ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  assert(
    parsed && typeof parsed === 'object' && !Array.isArray(parsed),
    `${label} must be a JSON object.`,
  );
  return parsed;
}

export function sha256File(filePath) {
  const digest = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let count;
    do {
      count = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (count > 0) {
        digest.update(buffer.subarray(0, count));
      }
    } while (count > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return digest.digest('hex');
}

function normalizeHttpsOrigin(value, location) {
  const raw = requiredTrimmedString(value, location);
  const parsed = new URL(raw);
  assert(parsed.protocol === 'https:', `${location} must use HTTPS.`);
  assert(
    (parsed.pathname === '/' || parsed.pathname === '') &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password,
    `${location} must be an HTTPS origin without a path, credentials, query, or fragment.`,
  );
  return parsed.origin;
}

function normalizeHttpsBaseUrl(value, location) {
  const raw = requiredTrimmedString(value, location);
  const parsed = new URL(raw);
  assert(parsed.protocol === 'https:', `${location} must use HTTPS.`);
  assert(
    !parsed.search && !parsed.hash && !parsed.username && !parsed.password,
    `${location} must not contain credentials, a query, or a fragment.`,
  );
  return parsed.href.replace(/\/+$/, '');
}

function validateTimestamp(value, location) {
  const raw = requiredTrimmedString(value, location);
  const timestamp = Date.parse(raw);
  assert(Number.isFinite(timestamp), `${location} must be an ISO-8601 timestamp.`);
  assert(
    /(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(raw),
    `${location} must include a timezone.`,
  );
  return timestamp;
}

function expectedAssetUrl(assetBaseUrl, objectPath) {
  const base = new URL(`${assetBaseUrl}/`);
  const encodedPath = objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return new URL(encodedPath, base).href;
}

export function assetUrlMatches(url, assetBaseUrl, objectPath) {
  try {
    const actual = new URL(url);
    const expected = new URL(expectedAssetUrl(assetBaseUrl, objectPath));
    return (
      actual.protocol === expected.protocol &&
      actual.host === expected.host &&
      decodeURIComponent(actual.pathname) === decodeURIComponent(expected.pathname) &&
      !actual.search &&
      !actual.hash
    );
  } catch {
    return false;
  }
}

function assertAsset(value, manifestAsset, kind, releaseId, location) {
  const suffix = kind === 'pdf' ? '.pdf' : '.webp';
  const pathKey = kind === 'pdf' ? 'pdfPath' : 'thumbnailPath';
  const shaKey = kind === 'pdf' ? 'sha256' : 'thumbnailSha256';
  const bytesKey = kind === 'pdf' ? 'bytes' : 'thumbnailBytes';
  const objectPath = requiredTrimmedString(value[pathKey], `${location}.${pathKey}`);
  assert(
    objectPath.startsWith(`releases/${releaseId}/assets/`) &&
      objectPath.toLowerCase().endsWith(suffix),
    `${location}.${pathKey} must use the immutable release ${releaseId}.`,
  );
  assert(
    requiredTrimmedString(value[shaKey], `${location}.${shaKey}`).toLowerCase() ===
      manifestAsset.sha256,
    `${location}.${shaKey} does not match the release manifest.`,
  );
  assert(
    requiredPositiveInteger(value[bytesKey], `${location}.${bytesKey}`) ===
      manifestAsset.bytes,
    `${location}.${bytesKey} does not match the release manifest.`,
  );
  assert(
    objectPath === manifestAsset.objectPath,
    `${location}.${pathKey} does not match the release manifest.`,
  );
}

/**
 * Load and cross-check every release binding before a browser is launched.
 *
 * This performs O(m + s) work for m manifest forms and s sampled forms by
 * indexing each identity once instead of scanning the 1,000-form release for
 * every canary.
 */
export function loadAndValidateCanaryInputs({
  samplePlanPath,
  manifestPath,
  hostingEvidencePath,
  expectedSourceCommit,
  expectedManifestSha256,
  expectedSamplePlanSha256,
  expectedHostingVersion,
  siteOrigin,
  assetBaseUrl,
}) {
  const resolvedSamplePlanPath = path.resolve(samplePlanPath);
  const resolvedManifestPath = path.resolve(manifestPath);
  const resolvedHostingEvidencePath = path.resolve(hostingEvidencePath);
  const normalizedSiteOrigin = normalizeHttpsOrigin(siteOrigin, 'site origin');
  const normalizedAssetBaseUrl = normalizeHttpsBaseUrl(
    assetBaseUrl,
    'asset base URL',
  );
  const normalizedExpectedSourceCommit = requiredTrimmedString(
    expectedSourceCommit,
    'expected source commit',
  ).toLowerCase();
  const normalizedExpectedManifestSha256 = requiredTrimmedString(
    expectedManifestSha256,
    'expected manifest SHA-256',
  ).toLowerCase();
  const normalizedExpectedSamplePlanSha256 = requiredTrimmedString(
    expectedSamplePlanSha256,
    'expected sample-plan SHA-256',
  ).toLowerCase();
  const normalizedExpectedHostingVersion = requiredTrimmedString(
    expectedHostingVersion,
    'expected Hosting version',
  );
  assert(
    COMMIT_PATTERN.test(normalizedExpectedSourceCommit),
    'Expected source commit must be a 40- or 64-character lowercase Git object ID.',
  );
  assert(
    SHA256_PATTERN.test(normalizedExpectedManifestSha256),
    'Expected manifest SHA-256 must be 64 lowercase hexadecimal characters.',
  );
  assert(
    SHA256_PATTERN.test(normalizedExpectedSamplePlanSha256),
    'Expected sample-plan SHA-256 must be 64 lowercase hexadecimal characters.',
  );
  assert(
    HOSTING_VERSION_PATTERN.test(normalizedExpectedHostingVersion),
    'Expected Hosting version must be an exact Firebase Hosting resource name.',
  );

  const manifestSha256 = sha256File(resolvedManifestPath);
  const samplePlanSha256 = sha256File(resolvedSamplePlanPath);
  const hostingEvidenceSha256 = sha256File(resolvedHostingEvidencePath);
  assert(
    manifestSha256 === normalizedExpectedManifestSha256,
    'Release manifest bytes do not match --expected-manifest-sha256.',
  );
  assert(
    samplePlanSha256 === normalizedExpectedSamplePlanSha256,
    'Sample-plan bytes do not match --expected-sample-plan-sha256.',
  );

  const manifest = readJsonObject(resolvedManifestPath, 'release manifest');
  const samplePlan = readJsonObject(resolvedSamplePlanPath, 'sample plan');
  const hostingEvidence = readJsonObject(
    resolvedHostingEvidencePath,
    'Hosting evidence',
  );
  assert(manifest.schemaVersion === 1, 'Release manifest must use schemaVersion 1.');
  assert(samplePlan.schemaVersion === 1, 'Sample plan must use schemaVersion 1.');
  assert(
    hostingEvidence.schemaVersion === 1,
    'Hosting evidence must use schemaVersion 1.',
  );

  const releaseId = requiredTrimmedString(
    manifest.releaseId,
    'release manifest.releaseId',
  );
  const sourceCommit = requiredTrimmedString(
    manifest.sourceCommit,
    'release manifest.sourceCommit',
  ).toLowerCase();
  assert(
    sourceCommit === normalizedExpectedSourceCommit,
    'Release manifest sourceCommit does not match --expected-source-commit.',
  );
  assert(
    Array.isArray(manifest.forms) && manifest.forms.length > 0,
    'Release manifest forms must be a non-empty array.',
  );
  const formById = new Map();
  manifest.forms.forEach((form, index) => {
    const location = `release manifest.forms[${index}]`;
    assert(form && typeof form === 'object' && !Array.isArray(form), `${location} must be an object.`);
    const catalogId = requiredTrimmedString(form.catalogId, `${location}.catalogId`);
    assert(!formById.has(catalogId), `Release manifest repeats catalogId ${catalogId}.`);
    requiredTrimmedString(form.slug, `${location}.slug`);
    requiredTrimmedString(form.sourceSection, `${location}.sourceSection`);
    requiredTrimmedString(form.filename, `${location}.filename`);
    requiredPositiveInteger(form.pageCount, `${location}.pageCount`);
    for (const [assetName, suffix] of [['pdf', '.pdf'], ['thumbnail', '.webp']]) {
      const asset = form[assetName];
      assert(asset && typeof asset === 'object' && !Array.isArray(asset), `${location}.${assetName} must be an object.`);
      const objectPath = requiredTrimmedString(
        asset.objectPath,
        `${location}.${assetName}.objectPath`,
      );
      assert(
        objectPath.startsWith(`releases/${releaseId}/assets/`) &&
          objectPath.toLowerCase().endsWith(suffix),
        `${location}.${assetName}.objectPath does not belong to the immutable release.`,
      );
      assert(
        SHA256_PATTERN.test(
          requiredTrimmedString(asset.sha256, `${location}.${assetName}.sha256`),
        ),
        `${location}.${assetName}.sha256 is invalid.`,
      );
      requiredPositiveInteger(asset.bytes, `${location}.${assetName}.bytes`);
    }
    formById.set(catalogId, form);
  });

  for (const [label, payload] of [
    ['sample plan', samplePlan],
    ['Hosting evidence', hostingEvidence],
  ]) {
    assert(payload.releaseId === releaseId, `${label}.releaseId does not match the manifest.`);
    assert(payload.sourceCommit === sourceCommit, `${label}.sourceCommit does not match the manifest.`);
    assert(payload.manifestSha256 === manifestSha256, `${label}.manifestSha256 does not match the manifest bytes.`);
  }
  assert(
    samplePlan.manifestSha256 === normalizedExpectedManifestSha256,
    'Sample plan does not bind the expected manifest SHA-256.',
  );
  assert(
    hostingEvidence.reportType === 'form-catalog-hosting-deployment' &&
      hostingEvidence.producer === 'controlled-deploy' &&
      hostingEvidence.environment === 'production' &&
      hostingEvidence.ok === true,
    'Hosting evidence must be a successful controlled production deploy receipt.',
  );
  assert(
    hostingEvidence.hostingVersion === normalizedExpectedHostingVersion,
    'Hosting evidence does not bind --expected-hosting-version.',
  );
  assert(
    Array.isArray(hostingEvidence.siteOrigins) &&
      hostingEvidence.siteOrigins.map((origin, index) =>
        normalizeHttpsOrigin(origin, `Hosting evidence.siteOrigins[${index}]`),
      ).includes(normalizedSiteOrigin),
    'Requested site origin is not present in the Hosting evidence.',
  );
  const deployedAtMs = validateTimestamp(
    hostingEvidence.deployedAt,
    'Hosting evidence.deployedAt',
  );
  assert(
    deployedAtMs <= Date.now() + 5 * 60 * 1000,
    'Hosting evidence deployment time is in the future.',
  );

  assert(
    Array.isArray(samplePlan.samples) && samplePlan.samples.length > 0,
    'Sample plan samples must be a non-empty array.',
  );
  const sampleById = new Map();
  samplePlan.samples.forEach((sample, index) => {
    const location = `sample plan.samples[${index}]`;
    assert(sample && typeof sample === 'object' && !Array.isArray(sample), `${location} must be an object.`);
    const catalogId = requiredTrimmedString(sample.catalogId, `${location}.catalogId`);
    assert(!sampleById.has(catalogId), `Sample plan repeats catalogId ${catalogId}.`);
    const sourceSection = requiredTrimmedString(sample.sourceSection, `${location}.sourceSection`);
    const filename = requiredTrimmedString(sample.filename, `${location}.filename`);
    assert(
      catalogId === `${sourceSection}/${filename.slice(0, -4)}` && filename.toLowerCase().endsWith('.pdf'),
      `${location}.catalogId does not match its source identity.`,
    );
    const manifestForm = formById.get(catalogId);
    assert(manifestForm, `${location}.catalogId is not in the release manifest.`);
    for (const key of ['slug', 'sourceSection', 'filename']) {
      assert(
        sample[key] === manifestForm[key],
        `${location}.${key} does not match the release manifest.`,
      );
    }
    assert(
      requiredPositiveInteger(sample.pageCount, `${location}.pageCount`) ===
        manifestForm.pageCount,
      `${location}.pageCount does not match the release manifest.`,
    );
    requiredPositiveInteger(sample.fieldCount, `${location}.fieldCount`);
    assertAsset(sample, manifestForm.pdf, 'pdf', releaseId, location);
    assertAsset(
      sample,
      manifestForm.thumbnail,
      'thumbnail',
      releaseId,
      location,
    );
    sampleById.set(catalogId, sample);
  });

  const browserCatalogIds = samplePlan.browserCatalogIds;
  assert(
    Array.isArray(browserCatalogIds) &&
      browserCatalogIds.length >= 1 &&
      browserCatalogIds.length <= 3 &&
      new Set(browserCatalogIds).size === browserCatalogIds.length,
    'Sample plan browserCatalogIds must contain 1 to 3 distinct identities.',
  );
  const browserSamples = browserCatalogIds.map((catalogId, index) => {
    const sample = sampleById.get(catalogId);
    assert(sample, `browserCatalogIds[${index}] is not present in samples.`);
    assert(
      sample.browserCanary === true,
      `browserCatalogIds[${index}] is not marked browserCanary.`,
    );
    return sample;
  });

  return {
    releaseId,
    sourceCommit,
    manifestSha256,
    samplePlanSha256,
    hostingEvidenceSha256,
    hostingVersion: normalizedExpectedHostingVersion,
    hostingDeployedAt: hostingEvidence.deployedAt,
    hostingDeployedAtMs: deployedAtMs,
    siteOrigin: normalizedSiteOrigin,
    assetBaseUrl: normalizedAssetBaseUrl,
    browserCatalogIds: [...browserCatalogIds],
    browserSamples,
    paths: {
      samplePlan: resolvedSamplePlanPath,
      manifest: resolvedManifestPath,
      hostingEvidence: resolvedHostingEvidencePath,
    },
  };
}

export function normalizeArtifactFilename(index, slug, suffix) {
  const stableSlug = String(slug || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
  assert(stableSlug, `Could not create an artifact name for slug ${slug}.`);
  return `${String(index + 1).padStart(2, '0')}-${stableSlug}-${suffix}`;
}

function readMagic(filePath, length) {
  const descriptor = fs.openSync(filePath, 'r');
  const header = Buffer.alloc(length);
  try {
    fs.readSync(descriptor, header, 0, length, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return header;
}

export function describeArtifact(kind, filePath, reportDirectory) {
  const absolutePath = path.resolve(filePath);
  const absoluteReportDirectory = path.resolve(reportDirectory);
  const relativePath = path.relative(absoluteReportDirectory, absolutePath);
  assert(
    relativePath &&
      !relativePath.startsWith('..') &&
      !path.isAbsolute(relativePath),
    `${kind} artifact must be inside the browser report directory.`,
  );
  assert(fs.statSync(absolutePath).size > 0, `${kind} artifact is empty.`);
  const header = readMagic(absolutePath, 8);
  if (kind === 'filled_pdf') {
    assert(header.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC), `${kind} artifact is not a PDF.`);
  } else {
    assert(
      ['catalog_page_screenshot', 'populated_workspace_screenshot'].includes(kind),
      `Unsupported browser canary artifact kind: ${kind}.`,
    );
    assert(header.equals(PNG_MAGIC), `${kind} artifact is not a PNG.`);
  }
  return {
    kind,
    path: relativePath.split(path.sep).join('/'),
    sha256: sha256File(absolutePath),
    bytes: fs.statSync(absolutePath).size,
  };
}

export function runBrowserPdfProbe({
  repoRoot,
  pdfPath,
  textField,
  expectedText,
  checkboxField,
  expectedPageCount,
  expectedFieldCount,
}) {
  const command = [
    '-m',
    'scripts.form_catalog_factory.browser_pdf_probe',
    '--pdf',
    pdfPath,
    '--text-field',
    textField,
    '--expected-text',
    expectedText,
    '--checkbox-field',
    checkboxField,
    '--expected-page-count',
    String(expectedPageCount),
    '--expected-field-count',
    String(expectedFieldCount),
  ];
  let output;
  try {
    output = execFileSync('python3', command, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch (error) {
    const stderr = error && typeof error === 'object' && 'stderr' in error
      ? String(error.stderr || '').trim()
      : '';
    throw new Error(
      `Independent filled-PDF reopen failed${stderr ? `: ${stderr}` : '.'}`,
    );
  }
  const line = output.trim().split('\n').at(-1);
  const parsed = JSON.parse(line);
  assert(parsed?.parser === 'pypdf', 'Filled-PDF probe did not use pypdf.');
  return parsed;
}

export function defaultBrowserCanaryOutputDirectory(repoRoot, releaseId) {
  return path.resolve(
    repoRoot,
    'mcp',
    'debugging',
    'mcp-screenshots',
    releaseId,
  );
}

export function assertBrowserCanaryOutputDirectory(repoRoot, releaseId, outputDirectory) {
  const expectedRoot = path.resolve(
    repoRoot,
    'mcp',
    'debugging',
    'mcp-screenshots',
  );
  const resolved = path.resolve(outputDirectory);
  const relative = path.relative(expectedRoot, resolved);
  assert(
    relative === releaseId,
    `Browser evidence must be written to mcp/debugging/mcp-screenshots/${releaseId}.`,
  );
  return resolved;
}

export function isDirectExecution(importMetaUrl) {
  return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(importMetaUrl);
}
