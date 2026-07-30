import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assetUrlMatches,
  describeArtifact,
  loadAndValidateCanaryInputs,
  normalizeArtifactFilename,
  sha256File,
} from './helpers/formCatalogBrowserCanary.mjs';
import {
  buildCanaryTextValue,
} from './run_form_catalog_browser_canary.mjs';

const SOURCE_COMMIT = 'a'.repeat(40);
const HOSTING_VERSION = 'sites/dullypdf/versions/catalog-release-new';
const ASSET_BASE =
  'https://storage.googleapis.com/dullypdf-form-catalog-assets-east4';

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return filePath;
}

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'dullypdf-browser-canary-'),
  );
  const releaseId = 'catalog-20260729-001';
  const forms = [
    {
      catalogId: 'section/form_a',
      slug: 'form-a',
      sourceSection: 'section',
      filename: 'form_a.pdf',
      pageCount: 2,
      pdf: {
        objectPath: `releases/${releaseId}/assets/section/form_a.pdf`,
        sha256: 'b'.repeat(64),
        bytes: 200,
      },
      thumbnail: {
        objectPath: `releases/${releaseId}/assets/section/form_a.webp`,
        sha256: 'c'.repeat(64),
        bytes: 100,
      },
    },
    {
      catalogId: 'section/form_b',
      slug: 'form-b',
      sourceSection: 'section',
      filename: 'form_b.pdf',
      pageCount: 3,
      pdf: {
        objectPath: `releases/${releaseId}/assets/section/form_b.pdf`,
        sha256: 'd'.repeat(64),
        bytes: 300,
      },
      thumbnail: {
        objectPath: `releases/${releaseId}/assets/section/form_b.webp`,
        sha256: 'e'.repeat(64),
        bytes: 120,
      },
    },
  ];
  const manifestPath = writeJson(path.join(root, 'release.json'), {
    schemaVersion: 1,
    releaseId,
    sourceCommit: SOURCE_COMMIT,
    forms,
  });
  const manifestSha256 = sha256File(manifestPath);
  const samples = forms.map((form, index) => ({
    catalogId: form.catalogId,
    slug: form.slug,
    sourceSection: form.sourceSection,
    filename: form.filename,
    pdfPath: form.pdf.objectPath,
    thumbnailPath: form.thumbnail.objectPath,
    sha256: form.pdf.sha256,
    bytes: form.pdf.bytes,
    thumbnailSha256: form.thumbnail.sha256,
    thumbnailBytes: form.thumbnail.bytes,
    pageCount: form.pageCount,
    fieldCount: 4 + index,
    browserCanary: true,
  }));
  const samplePlanPath = writeJson(path.join(root, 'samples.json'), {
    schemaVersion: 1,
    releaseId,
    sourceCommit: SOURCE_COMMIT,
    manifestSha256,
    browserCatalogIds: [forms[1].catalogId, forms[0].catalogId],
    samples,
  });
  const hostingEvidencePath = writeJson(path.join(root, 'hosting.json'), {
    schemaVersion: 1,
    reportType: 'form-catalog-hosting-deployment',
    producer: 'controlled-deploy',
    environment: 'production',
    ok: true,
    releaseId,
    sourceCommit: SOURCE_COMMIT,
    manifestSha256,
    hostingVersion: HOSTING_VERSION,
    siteOrigins: ['https://dullypdf.com', 'https://dullypdf.web.app'],
    deployedAt: '2026-07-29T18:00:00Z',
  });
  return {
    root,
    releaseId,
    manifestPath,
    manifestSha256,
    samplePlanPath,
    samplePlanSha256: sha256File(samplePlanPath),
    hostingEvidencePath,
  };
}

function bindingArgs(files) {
  return {
    samplePlanPath: files.samplePlanPath,
    manifestPath: files.manifestPath,
    hostingEvidencePath: files.hostingEvidencePath,
    expectedSourceCommit: SOURCE_COMMIT,
    expectedManifestSha256: files.manifestSha256,
    expectedSamplePlanSha256: files.samplePlanSha256,
    expectedHostingVersion: HOSTING_VERSION,
    siteOrigin: 'https://dullypdf.com',
    assetBaseUrl: ASSET_BASE,
  };
}

test('exact release inputs preserve browserCatalogIds order', () => {
  const files = fixture();
  const binding = loadAndValidateCanaryInputs(bindingArgs(files));

  assert.deepEqual(binding.browserCatalogIds, [
    'section/form_b',
    'section/form_a',
  ]);
  assert.deepEqual(
    binding.browserSamples.map((sample) => sample.catalogId),
    binding.browserCatalogIds,
  );
  assert.equal(binding.manifestSha256, files.manifestSha256);
  assert.equal(binding.samplePlanSha256, files.samplePlanSha256);
  assert.equal(binding.siteOrigin, 'https://dullypdf.com');
});

test('sample-plan byte tampering fails before browser launch', () => {
  const files = fixture();
  const plan = JSON.parse(fs.readFileSync(files.samplePlanPath, 'utf8'));
  plan.browserCatalogIds.reverse();
  writeJson(files.samplePlanPath, plan);

  assert.throws(
    () => loadAndValidateCanaryInputs(bindingArgs(files)),
    /Sample-plan bytes do not match/,
  );
});

test('sample-to-manifest asset mismatch fails closed', () => {
  const files = fixture();
  const plan = JSON.parse(fs.readFileSync(files.samplePlanPath, 'utf8'));
  plan.samples[0].pdfPath =
    `releases/${files.releaseId}/assets/section/other.pdf`;
  writeJson(files.samplePlanPath, plan);
  const args = {
    ...bindingArgs(files),
    expectedSamplePlanSha256: sha256File(files.samplePlanPath),
  };

  assert.throws(
    () => loadAndValidateCanaryInputs(args),
    /pdfPath does not match the release manifest/,
  );
});

test('artifact descriptions bind relative bytes and hashes', () => {
  const files = fixture();
  const screenshotPath = path.join(files.root, 'catalog.png');
  fs.writeFileSync(
    screenshotPath,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('machine screenshot'),
    ]),
  );

  const artifact = describeArtifact(
    'catalog_page_screenshot',
    screenshotPath,
    files.root,
  );

  assert.equal(artifact.path, 'catalog.png');
  assert.equal(artifact.bytes, fs.statSync(screenshotPath).size);
  assert.equal(artifact.sha256, sha256File(screenshotPath));
});

test('asset URL matching rejects a site-origin lookalike path', () => {
  const objectPath =
    'releases/catalog-20260729-001/assets/section/form_a.pdf';
  assert.equal(
    assetUrlMatches(`${ASSET_BASE}/${objectPath}`, ASSET_BASE, objectPath),
    true,
  );
  assert.equal(
    assetUrlMatches(
      `https://dullypdf.com/${objectPath}`,
      ASSET_BASE,
      objectPath,
    ),
    false,
  );
  assert.equal(
    normalizeArtifactFilename(0, 'Form A / Release', 'catalog.png'),
    '01-form-a-release-catalog.png',
  );
});

test('runner imports safely and builds its deterministic fill value', () => {
  assert.equal(
    buildCanaryTextValue('section/form_a'),
    'Canary 8f8655a0',
  );
  assert.equal(
    buildCanaryTextValue('section/form_a'),
    buildCanaryTextValue('section/form_a'),
  );
  assert.notEqual(
    buildCanaryTextValue('section/form_a'),
    buildCanaryTextValue('section/form_b'),
  );
});
