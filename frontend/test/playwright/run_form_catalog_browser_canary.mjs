import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { chromium } from '@playwright/test';

import {
  BROWSER_CANARY_PRODUCER_VERSION,
  BROWSER_CANARY_REPORT_NAME,
  DEFAULT_BROWSER_CANARY_ASSET_BASE_URL,
  DEFAULT_BROWSER_CANARY_VIEWPORT,
  assertBrowserCanaryOutputDirectory,
  assetUrlMatches,
  defaultBrowserCanaryOutputDirectory,
  describeArtifact,
  isDirectExecution,
  loadAndValidateCanaryInputs,
  normalizeArtifactFilename,
  runBrowserPdfProbe,
} from './helpers/formCatalogBrowserCanary.mjs';

const require = createRequire(import.meta.url);
const playwrightVersion = require('@playwright/test/package.json').version;
const repoRoot = process.cwd();

export function buildCanaryTextValue(catalogId) {
  const valueHash = crypto
    .createHash('sha256')
    .update(catalogId)
    .digest('hex')
    .slice(0, 8);
  return `Canary ${valueHash}`;
}

function logStep(message) {
  console.log(`[form-catalog-browser-canary] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function parseArgs(argv) {
  const values = {};
  const flags = new Set();
  const booleanFlags = new Set(['--headed', '--overwrite']);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (booleanFlags.has(token)) {
      flags.add(token);
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`${token} requires a value.`);
    }
    values[token] = next;
    index += 1;
  }
  const required = [
    '--sample-plan',
    '--manifest',
    '--hosting-evidence',
    '--expected-source-commit',
    '--expected-manifest-sha256',
    '--expected-sample-plan-sha256',
    '--expected-hosting-version',
    '--site-origin',
  ];
  for (const option of required) {
    if (!values[option]) {
      throw new Error(`Missing required option: ${option}`);
    }
  }
  const timeoutMs = Number(values['--timeout-ms'] || 120000);
  assert(
    Number.isInteger(timeoutMs) && timeoutMs >= 30000 && timeoutMs <= 300000,
    '--timeout-ms must be an integer from 30000 through 300000.',
  );
  return {
    samplePlanPath: values['--sample-plan'],
    manifestPath: values['--manifest'],
    hostingEvidencePath: values['--hosting-evidence'],
    expectedSourceCommit: values['--expected-source-commit'],
    expectedManifestSha256: values['--expected-manifest-sha256'],
    expectedSamplePlanSha256: values['--expected-sample-plan-sha256'],
    expectedHostingVersion: values['--expected-hosting-version'],
    siteOrigin: values['--site-origin'],
    assetBaseUrl:
      values['--asset-base-url'] || DEFAULT_BROWSER_CANARY_ASSET_BASE_URL,
    outputDirectory: values['--output-dir'] || null,
    executablePath:
      values['--executable-path'] ||
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ||
      null,
    timeoutMs,
    headless: !flags.has('--headed'),
    overwrite: flags.has('--overwrite'),
  };
}

function credentials() {
  const email = (
    process.env.DULLYPDF_E2E_EMAIL ||
    process.env.SMOKE_LOGIN_EMAIL ||
    process.env.PLAYWRIGHT_USER_EMAIL ||
    ''
  ).trim();
  const password =
    process.env.DULLYPDF_E2E_PASSWORD ||
    process.env.SMOKE_LOGIN_PASSWORD ||
    process.env.PLAYWRIGHT_USER_PASSWORD ||
    '';
  assert(
    email && password,
    'Production browser-canary authentication is missing. Configure DULLYPDF_E2E_EMAIL and DULLYPDF_E2E_PASSWORD (or the existing SMOKE_LOGIN aliases).',
  );
  return { email, password };
}

async function visibleErrorAlerts(page) {
  const alerts = page.locator('.ui-alert--error:visible');
  return alerts.evaluateAll((nodes) =>
    nodes.map((node) => node.textContent?.trim() || '').filter(Boolean),
  );
}

async function assertNoVisibleErrors(page, location) {
  const errors = await visibleErrorAlerts(page);
  assert(
    errors.length === 0,
    `${location} displayed an error alert: ${errors.join(' | ')}`,
  );
}

async function signIn(page, binding, auth, timeoutMs) {
  logStep('signing in through the deployed UI');
  await page.goto(binding.siteOrigin, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });
  const signInButton = page.getByRole('button', {
    name: 'Sign in',
    exact: true,
  }).first();
  const openProfileButton = page.getByTitle('Open profile').first();
  await Promise.race([
    signInButton.waitFor({ state: 'visible', timeout: timeoutMs }),
    openProfileButton.waitFor({ state: 'visible', timeout: timeoutMs }),
  ]);
  if (await openProfileButton.isVisible().catch(() => false)) {
    return;
  }

  await signInButton.click();
  await page
    .getByRole('heading', { name: 'Sign in to DullyPDF' })
    .waitFor({ state: 'visible', timeout: timeoutMs });
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('identitytoolkit.googleapis.com') &&
      response.url().includes('accounts:signInWithPassword'),
    { timeout: timeoutMs },
  );
  await page.getByLabel('Email').fill(auth.email);
  await page.getByLabel('Password').fill(auth.password);
  await page
    .getByRole('button', { name: 'Sign in', exact: true })
    .click();
  const response = await responsePromise;
  assert(
    response.ok(),
    `Production password sign-in failed with HTTP ${response.status()}.`,
  );
  await openProfileButton.waitFor({ state: 'visible', timeout: timeoutMs });
}

function collectAssetResponses(page, binding) {
  const responses = [];
  page.on('response', (response) => {
    const sample = binding.browserSamples.find((candidate) =>
      assetUrlMatches(
        response.url(),
        binding.assetBaseUrl,
        candidate.pdfPath,
      ),
    );
    if (!sample) {
      return;
    }
    responses.push({
      catalogId: sample.catalogId,
      url: response.url(),
      status: response.status(),
      ok: response.ok(),
      at: new Date().toISOString(),
    });
  });
  return responses;
}

async function waitForPdfResponse(
  responses,
  catalogId,
  minimumIndex,
  timeoutMs,
) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const match = responses
      .slice(minimumIndex)
      .find((response) => response.catalogId === catalogId && response.ok);
    if (match) {
      return match;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }
  throw new Error(
    `${catalogId}: no successful immutable PDF response was observed in the browser.`,
  );
}

async function catalogPageEvidence(page, sample, binding, screenshotPath, timeoutMs) {
  const url = `${binding.siteOrigin}/forms/${encodeURIComponent(sample.slug)}`;
  const responseStart = binding.assetResponses.length;
  await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: timeoutMs,
  });

  const marker = page.locator('main.form-catalog__main').first();
  await marker.waitFor({ state: 'visible', timeout: timeoutMs });
  const heading = (
    (await page.getByRole('heading', { level: 1 }).first().textContent()) || ''
  ).trim();
  const documentTitle = await page.title();
  assert(heading, `${sample.catalogId}: catalog page has no H1.`);
  assert(
    documentTitle.includes(heading),
    `${sample.catalogId}: document title does not include the catalog H1.`,
  );

  const identity = {
    sourceSection: await marker.getAttribute(
      'data-form-catalog-source-section',
    ),
    filename: await marker.getAttribute('data-form-catalog-filename'),
    pdfUrl: await marker.getAttribute('data-form-catalog-pdf-url'),
    sha256: await marker.getAttribute('data-form-catalog-sha256'),
  };
  assert(
    identity.sourceSection === sample.sourceSection &&
      identity.filename === sample.filename &&
      identity.sha256 === sample.sha256,
    `${sample.catalogId}: catalog identity marker does not match the sampled release.`,
  );
  assert(
    assetUrlMatches(identity.pdfUrl, binding.assetBaseUrl, sample.pdfPath),
    `${sample.catalogId}: catalog identity marker does not use the sampled immutable PDF.`,
  );

  const pageCount = await page
    .locator('.form-catalog-detail__facts')
    .evaluate((facts) => {
      const rows = Array.from(facts.querySelectorAll('div'));
      const pageRow = rows.find(
        (row) => row.querySelector('dt')?.textContent?.trim() === 'Pages',
      );
      return Number(pageRow?.querySelector('dd')?.textContent?.trim() || 0);
    });
  assert(
    pageCount === sample.pageCount,
    `${sample.catalogId}: expected ${sample.pageCount} displayed pages, found ${pageCount}.`,
  );

  const thumbnail = page
    .locator('img.form-catalog-detail__preview-image')
    .first();
  await thumbnail.waitFor({ state: 'attached', timeout: timeoutMs });
  const thumbnailFacts = await thumbnail.evaluate((image) => ({
    src: image.currentSrc || image.src,
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  }));
  assert(
    thumbnailFacts.complete &&
      thumbnailFacts.naturalWidth > 0 &&
      thumbnailFacts.naturalHeight > 0,
    `${sample.catalogId}: catalog thumbnail did not decode.`,
  );
  assert(
    assetUrlMatches(
      thumbnailFacts.src,
      binding.assetBaseUrl,
      sample.thumbnailPath,
    ),
    `${sample.catalogId}: catalog thumbnail does not use the sampled immutable asset.`,
  );

  await page.waitForFunction(
    () => {
      const canvas = document.querySelector(
        'canvas.form-catalog-detail__preview-canvas',
      );
      return (
        canvas instanceof HTMLCanvasElement &&
        canvas.getAttribute('aria-hidden') !== 'true' &&
        canvas.width > 0 &&
        canvas.height > 0
      );
    },
    undefined,
    { timeout: timeoutMs },
  );
  const preview = await page
    .locator('canvas.form-catalog-detail__preview-canvas')
    .first()
    .evaluate((canvas) => ({
      width: canvas.width,
      height: canvas.height,
      clientWidth: canvas.clientWidth,
      clientHeight: canvas.clientHeight,
    }));
  assert(
    preview.width > 0 &&
      preview.height > 0 &&
      preview.clientWidth > 0 &&
      preview.clientHeight > 0,
    `${sample.catalogId}: high-resolution PDF preview is not visible.`,
  );
  await assertNoVisibleErrors(page, `${sample.catalogId} catalog page`);
  const pdfResponse = await waitForPdfResponse(
    binding.assetResponses,
    sample.catalogId,
    responseStart,
    timeoutMs,
  );
  await page.screenshot({ path: screenshotPath, fullPage: false });
  return {
    url,
    finalUrl: page.url(),
    documentTitle,
    heading,
    sourceSection: identity.sourceSection,
    filename: identity.filename,
    sha256: identity.sha256,
    immutablePdfPath: sample.pdfPath,
    pdfUrl: identity.pdfUrl,
    pageCount,
    thumbnailPath: sample.thumbnailPath,
    thumbnailUrl: thumbnailFacts.src,
    thumbnailNaturalWidth: thumbnailFacts.naturalWidth,
    thumbnailNaturalHeight: thumbnailFacts.naturalHeight,
    previewCanvasWidth: preview.width,
    previewCanvasHeight: preview.height,
    sourceResponseStatus: pdfResponse.status,
  };
}

async function activateFirstWritableField(page, fieldType, timeoutMs) {
  const rowSelector = `.field-row:has(.field-row__type--${fieldType})`;
  const rows = page.locator(rowSelector);
  const count = await rows.count();
  assert(count > 0, `Workspace does not contain a ${fieldType} field.`);
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    const fieldName = (
      (await row.locator('.field-row__name').textContent()) || ''
    ).trim();
    if (!fieldName) {
      continue;
    }
    await row.click();
    const activeBox = page
      .locator(`.field-input-box--active.field-input-box--${fieldType}`)
      .first();
    await activeBox.waitFor({ state: 'visible', timeout: timeoutMs });
    const input =
      fieldType === 'checkbox'
        ? activeBox.locator('input[type="checkbox"]').first()
        : activeBox.locator('input[type="text"]').first();
    if (
      !(await input.isVisible().catch(() => false)) ||
      (await input.isDisabled())
    ) {
      continue;
    }
    if (
      fieldType === 'text' &&
      (!(await input.isEditable().catch(() => false)) ||
        (await input.getAttribute('readonly')) !== null)
    ) {
      continue;
    }
    const ariaLabel = (await input.getAttribute('aria-label')) || '';
    assert(
      ariaLabel === fieldName,
      `${fieldType} overlay aria-label does not match its field-row identity.`,
    );
    return { fieldName, input };
  }
  throw new Error(`Workspace has no writable ${fieldType} field.`);
}

async function enableFillModeAndAllPages(page, timeoutMs) {
  const fillButton = page.getByRole('button', { name: /^Fill$/ }).first();
  await fillButton.waitFor({ state: 'visible', timeout: timeoutMs });
  await fillButton.click();
  const allPages = page.locator('#panel-toggle-all');
  if (!(await allPages.isChecked())) {
    await allPages.check();
  }
}

async function populateRepresentativeFields(page, sample, timeoutMs) {
  await enableFillModeAndAllPages(page, timeoutMs);
  const fieldRowCount = await page.locator('.field-row').count();
  const textFieldCount = await page
    .locator('.field-row:has(.field-row__type--text)')
    .count();
  const checkboxFieldCount = await page
    .locator('.field-row:has(.field-row__type--checkbox)')
    .count();
  assert(fieldRowCount > 0, `${sample.catalogId}: workspace has no field rows.`);
  assert(textFieldCount > 0, `${sample.catalogId}: workspace has no text fields.`);
  assert(
    checkboxFieldCount > 0,
    `${sample.catalogId}: workspace has no checkbox fields.`,
  );

  const textValue = buildCanaryTextValue(sample.catalogId);
  const text = await activateFirstWritableField(page, 'text', timeoutMs);
  await text.input.fill(textValue);
  await text.input.press('Tab');
  assert(
    (await text.input.inputValue()) === textValue,
    `${sample.catalogId}: text input did not retain its representative value.`,
  );

  const checkbox = await activateFirstWritableField(
    page,
    'checkbox',
    timeoutMs,
  );
  await checkbox.input.check();
  assert(
    await checkbox.input.isChecked(),
    `${sample.catalogId}: checkbox input did not remain checked.`,
  );

  return {
    fieldRowCount,
    textFieldCount,
    checkboxFieldCount,
    text: {
      fieldName: text.fieldName,
      expectedValue: textValue,
      observedValue: textValue,
    },
    checkbox: {
      fieldName: checkbox.fieldName,
      expectedChecked: true,
      observedChecked: true,
    },
  };
}

async function downloadEditablePdf(page, outputPath, timeoutMs) {
  const downloadPromise = page
    .waitForEvent('download', { timeout: timeoutMs })
    .then((download) => ({ download }));
  const errorPromise = page
    .locator('.ui-alert--error:visible')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs })
    .then(async () => ({
      error: (
        (await page.locator('.ui-alert--error:visible').first().textContent()) ||
        ''
      ).trim(),
    }));
  await page
    .getByRole('button', { name: /^Download/ })
    .first()
    .click();
  await page
    .getByRole('menuitem', { name: /Download editable PDF/ })
    .click();
  const outcome = await Promise.race([downloadPromise, errorPromise]);
  if ('error' in outcome) {
    if (/download|quota|used all|remaining/i.test(outcome.error)) {
      throw new Error(
        `Production canary account cannot download the filled PDF; its generated-download quota may be exhausted: ${outcome.error}`,
      );
    }
    throw new Error(`Filled-PDF download displayed an error: ${outcome.error}`);
  }
  const { download } = outcome;
  const failure = await download.failure();
  assert(!failure, `Browser download failed: ${failure}`);
  await download.saveAs(outputPath);
  assert(fs.existsSync(outputPath), 'Browser did not save the filled PDF.');
  return download.suggestedFilename();
}

async function activateFieldByExactName(
  page,
  fieldType,
  fieldName,
  timeoutMs,
) {
  const rows = page.locator(
    `.field-row:has(.field-row__type--${fieldType})`,
  );
  const count = await rows.count();
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index);
    if (
      ((await row.locator('.field-row__name').textContent()) || '').trim() !==
      fieldName
    ) {
      continue;
    }
    await row.click();
    const input = page
      .locator(
        `.field-input-box--active.field-input-box--${fieldType} input`,
      )
      .first();
    await input.waitFor({ state: 'visible', timeout: timeoutMs });
    assert(
      (await input.getAttribute('aria-label')) === fieldName,
      `Reopened ${fieldType} overlay does not match ${fieldName}.`,
    );
    return input;
  }
  throw new Error(`Reopened workspace does not contain ${fieldType} field ${fieldName}.`);
}

async function reopenDownloadedPdf(
  context,
  binding,
  filledPdfPath,
  fill,
  timeoutMs,
) {
  logStep('reopening the downloaded PDF in a fresh authenticated workspace');
  const page = await context.newPage();
  try {
    await page.goto(`${binding.siteOrigin}/upload`, {
      waitUntil: 'domcontentloaded',
      timeout: timeoutMs,
    });
    const upload = page.getByLabel('Upload Fillable PDF Template');
    await upload.waitFor({ state: 'attached', timeout: timeoutMs });
    await upload.setInputFiles(filledPdfPath);
    await page
      .locator('.field-list .field-row__name')
      .first()
      .waitFor({ state: 'visible', timeout: timeoutMs });
    await enableFillModeAndAllPages(page, timeoutMs);

    const textInput = await activateFieldByExactName(
      page,
      'text',
      fill.text.fieldName,
      timeoutMs,
    );
    const browserTextValue = await textInput.inputValue();
    assert(
      browserTextValue === fill.text.expectedValue,
      `Reopened text value differs: expected ${fill.text.expectedValue}, found ${browserTextValue}.`,
    );
    const checkboxInput = await activateFieldByExactName(
      page,
      'checkbox',
      fill.checkbox.fieldName,
      timeoutMs,
    );
    const browserCheckboxChecked = await checkboxInput.isChecked();
    assert(
      browserCheckboxChecked,
      `Reopened checkbox ${fill.checkbox.fieldName} is not checked.`,
    );
    await assertNoVisibleErrors(page, 'reopened filled PDF workspace');
    return {
      workspaceUrl: page.url(),
      textFieldName: fill.text.fieldName,
      textValue: browserTextValue,
      checkboxFieldName: fill.checkbox.fieldName,
      checkboxChecked: browserCheckboxChecked,
      errorAlertCount: 0,
    };
  } finally {
    await page.close();
  }
}

async function runCanary(
  page,
  context,
  sample,
  index,
  binding,
  outputDirectory,
  timeoutMs,
  overwrite,
) {
  logStep(
    `running ${index + 1}/${binding.browserSamples.length}: ${sample.catalogId}`,
  );
  const paths = {
    catalogScreenshot: path.join(
      outputDirectory,
      normalizeArtifactFilename(index, sample.slug, 'catalog.png'),
    ),
    workspaceScreenshot: path.join(
      outputDirectory,
      normalizeArtifactFilename(index, sample.slug, 'workspace.png'),
    ),
    filledPdf: path.join(
      outputDirectory,
      normalizeArtifactFilename(index, sample.slug, 'filled.pdf'),
    ),
  };
  for (const target of Object.values(paths)) {
    if (fs.existsSync(target)) {
      assert(overwrite, `Artifact already exists; rerun with --overwrite: ${target}`);
      fs.rmSync(target);
    }
  }

  const catalogPage = await catalogPageEvidence(
    page,
    sample,
    binding,
    paths.catalogScreenshot,
    timeoutMs,
  );
  const responseStart = binding.assetResponses.length;
  const cta = page.getByRole('button', {
    name: /^Download .+ fillable form$/,
  }).first();
  await cta.waitFor({ state: 'visible', timeout: timeoutMs });
  await cta.click();
  await page.waitForFunction(
    () => window.location.pathname === '/ui',
    undefined,
    { timeout: timeoutMs },
  );
  await page
    .locator('.field-list .field-row__name')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
  await page
    .locator('[data-page-number="1"]')
    .first()
    .waitFor({ state: 'visible', timeout: timeoutMs });
  const sourceResponse = await waitForPdfResponse(
    binding.assetResponses,
    sample.catalogId,
    responseStart,
    timeoutMs,
  );
  await assertNoVisibleErrors(page, `${sample.catalogId} workspace`);

  const fill = await populateRepresentativeFields(page, sample, timeoutMs);
  const fieldOverlayCount = await page
    .locator('.field-input-box[data-field-id]')
    .count();
  assert(
    fieldOverlayCount > 0,
    `${sample.catalogId}: Fill mode rendered no field overlays.`,
  );
  await page.screenshot({
    path: paths.workspaceScreenshot,
    fullPage: false,
  });

  const suggestedFilename = await downloadEditablePdf(
    page,
    paths.filledPdf,
    timeoutMs,
  );
  const parsedPdf = runBrowserPdfProbe({
    repoRoot,
    pdfPath: paths.filledPdf,
    textField: fill.text.fieldName,
    expectedText: fill.text.expectedValue,
    checkboxField: fill.checkbox.fieldName,
    expectedPageCount: sample.pageCount,
    expectedFieldCount: sample.fieldCount,
  });
  const browserReopen = await reopenDownloadedPdf(
    context,
    binding,
    paths.filledPdf,
    fill,
    timeoutMs,
  );
  const artifacts = [
    describeArtifact(
      'catalog_page_screenshot',
      paths.catalogScreenshot,
      outputDirectory,
    ),
    describeArtifact(
      'populated_workspace_screenshot',
      paths.workspaceScreenshot,
      outputDirectory,
    ),
    describeArtifact('filled_pdf', paths.filledPdf, outputDirectory),
  ];

  return {
    catalogId: sample.catalogId,
    slug: sample.slug,
    sourceSection: sample.sourceSection,
    filename: sample.filename,
    ok: true,
    checks: {
      catalogIdentity: true,
      immutablePdfPath: true,
      fieldOverlays: true,
      fillSaveReopen: true,
    },
    observations: {
      catalogPage,
      workspace: {
        url: page.url(),
        immutablePdfPath: sample.pdfPath,
        sourceResponseUrl: sourceResponse.url,
        sourceResponseStatus: sourceResponse.status,
        fieldRowCount: fill.fieldRowCount,
        textFieldCount: fill.textFieldCount,
        checkboxFieldCount: fill.checkboxFieldCount,
        fieldOverlayCount,
        errorAlertCount: 0,
      },
      fill: {
        text: fill.text,
        checkbox: fill.checkbox,
      },
      download: {
        exportMode: 'editable',
        suggestedFilename,
      },
      reopen: {
        browser: browserReopen,
        pdf: {
          parser: parsedPdf.parser,
          sha256: parsedPdf.sha256,
          bytes: parsedPdf.bytes,
          pageCount: parsedPdf.pageCount,
          fieldCount: parsedPdf.fieldCount,
          text: parsedPdf.text,
          checkbox: parsedPdf.checkbox,
        },
      },
    },
    artifacts,
  };
}

async function writeReport(outputDirectory, report) {
  const reportPath = path.join(
    outputDirectory,
    BROWSER_CANARY_REPORT_NAME,
  );
  const temporaryPath = `${reportPath}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    `${JSON.stringify(report, null, 2)}\n`,
    'utf8',
  );
  fs.renameSync(temporaryPath, reportPath);
  return reportPath;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const binding = loadAndValidateCanaryInputs(options);
  const auth = credentials();
  logStep(
    'authentication preflight passed; generated-download quota will be verified by the first real editable-PDF download',
  );
  const outputDirectory = assertBrowserCanaryOutputDirectory(
    repoRoot,
    binding.releaseId,
    options.outputDirectory ||
      defaultBrowserCanaryOutputDirectory(repoRoot, binding.releaseId),
  );
  fs.mkdirSync(outputDirectory, { recursive: true });
  const reportPath = path.join(outputDirectory, BROWSER_CANARY_REPORT_NAME);
  if (fs.existsSync(reportPath)) {
    assert(
      options.overwrite,
      `Passing report already exists; rerun with --overwrite: ${reportPath}`,
    );
    fs.rmSync(reportPath);
  }

  const startedAt = new Date().toISOString();
  assert(
    Date.parse(startedAt) >= binding.hostingDeployedAtMs,
    'Browser canary started before the bound Hosting deployment.',
  );
  const browser = await chromium.launch({
    headless: options.headless,
    ...(options.executablePath
      ? { executablePath: path.resolve(options.executablePath) }
      : {}),
  });
  const context = await browser.newContext({
    viewport: DEFAULT_BROWSER_CANARY_VIEWPORT,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  binding.assetResponses = collectAssetResponses(page, binding);
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await signIn(page, binding, auth, options.timeoutMs);
    const results = [];
    for (let index = 0; index < binding.browserSamples.length; index += 1) {
      results.push(
        await runCanary(
          page,
          context,
          binding.browserSamples[index],
          index,
          binding,
          outputDirectory,
          options.timeoutMs,
          options.overwrite,
        ),
      );
    }
    const completedAt = new Date().toISOString();
    const report = {
      schemaVersion: 1,
      reportType: 'form-catalog-browser-canary',
      producer: 'playwright',
      producerVersion: BROWSER_CANARY_PRODUCER_VERSION,
      releaseId: binding.releaseId,
      sourceCommit: binding.sourceCommit,
      manifestSha256: binding.manifestSha256,
      samplePlanSha256: binding.samplePlanSha256,
      hostingEvidenceSha256: binding.hostingEvidenceSha256,
      hostingVersion: binding.hostingVersion,
      hostingDeployedAt: binding.hostingDeployedAt,
      siteOrigin: binding.siteOrigin,
      assetBaseUrl: binding.assetBaseUrl,
      startedAt,
      completedAt,
      automation: {
        library: '@playwright/test',
        libraryVersion: playwrightVersion,
        browser: 'chromium',
        browserVersion: browser.version(),
        headless: options.headless,
        viewport: DEFAULT_BROWSER_CANARY_VIEWPORT,
      },
      resultCount: results.length,
      ok: true,
      results,
    };
    const writtenPath = await writeReport(outputDirectory, report);
    logStep(`passing machine evidence written to ${writtenPath}`);
    console.log(
      JSON.stringify({
        ok: true,
        reportPath: writtenPath,
        releaseId: binding.releaseId,
        browserCatalogIds: binding.browserCatalogIds,
      }),
    );
  } catch (error) {
    const failureScreenshot = path.join(
      outputDirectory,
      'browser-canary-failure.png',
    );
    await page
      .screenshot({ path: failureScreenshot, fullPage: false })
      .catch(() => {});
    throw error;
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
}

if (isDirectExecution(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
  });
}
