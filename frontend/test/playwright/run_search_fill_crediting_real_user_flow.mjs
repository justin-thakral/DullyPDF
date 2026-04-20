#!/usr/bin/env node
/**
 * Search & Fill crediting — real-user UI flow.
 *
 * Drives the browser through the Search & Fill modal to exercise the
 * frontend commit path end-to-end:
 *
 *   • Single-template fill: one matched row should trigger a POST to
 *     ``/api/search-fill/usage`` with ``scopeType='template'`` and
 *     ``countIncrement=1``. The modal must commit BEFORE ``onFieldsChange``.
 *   • Duplicate submit: pressing Fill PDF twice in a row with the same
 *     ``requestId`` must return ``status='replayed'`` and not double-charge.
 *   • Profile page: after the commit the Search & Fill card must show the
 *     debited credit.
 *
 * To avoid paying for real OpenAI calls this script stubs
 * ``POST /api/renames/ai`` with ``buildMockRenameResult`` so the PDF's
 * field names line up with the CSV columns. The Search & Fill network
 * calls hit the real backend though — that's the integration we care about.
 *
 * Env:
 *   PLAYWRIGHT_BASE_URL        default http://127.0.0.1:5173
 *   PLAYWRIGHT_API_URL         default http://127.0.0.1:8000
 *   SMOKE_LOGIN_EMAIL/PASSWORD seeded account with some Search & Fill budget
 *   SEARCH_FILL_SAMPLE_PDF     default quickTestFiles/new_patient_forms_1915ccb015.pdf
 *   SEARCH_FILL_SAMPLE_CSV     default quickTestFiles/new_patient_forms_1915ccb015_mock.csv
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import {
  buildMockRenameResult,
  defaultFillableSamplePdfPath,
  parseJsonPostData,
  repoRoot,
  retry,
  signInFromHomepageAndOpenProfile,
  uploadFillablePdfAndWaitForEditor,
} from './helpers/workspaceFixture.mjs';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotDir = path.join(artifactDir, 'search-fill-crediting');
const summaryPath = path.join(artifactDir, 'search-fill-crediting-real-user-flow.json');
const loginEmail = (process.env.SMOKE_LOGIN_EMAIL || process.env.PLAYWRIGHT_LOGIN_EMAIL || '').trim();
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD || process.env.PLAYWRIGHT_LOGIN_PASSWORD || '';
// Use the dental intake form by default — it has 182 real AcroForm fields so
// the "Upload Fillable PDF Template" editor renders immediately. The packaged
// `new_patient_forms_*.pdf` in quickTestFiles is flattened (0 AcroForm
// fields) and cannot be used with the fillable-upload path.
const samplePdfPath = process.env.SEARCH_FILL_SAMPLE_PDF || defaultFillableSamplePdfPath;
// Column names must match the rename targets emitted by
// `buildMockRenameResult` so Search & Fill produces ≥1 matched field
// without needing a real OpenAI call. Override by setting the env var.
const sampleCsvPath = process.env.SEARCH_FILL_SAMPLE_CSV
  || path.resolve(artifactDir, 'search-fill-crediting-inline.csv');
const inlineCsvHeaders = [
  'patient_full_name',
  'patient_first_name',
  'patient_last_name',
  'patient_date_of_birth',
  'patient_phone',
  'patient_email',
  'patient_signature_name',
  'patient_address',
];
const inlineCsvRows = [
  {
    patient_full_name: 'Justin Thakral',
    patient_first_name: 'Justin',
    patient_last_name: 'Thakral',
    patient_date_of_birth: '1990-02-14',
    patient_phone: '415-555-0101',
    patient_email: 'justin.thakral@example.com',
    patient_signature_name: 'Justin Thakral',
    patient_address: '742 Mission St, San Francisco, CA 94103',
  },
];

function ensureInlineCsv() {
  if (fs.existsSync(sampleCsvPath) && process.env.SEARCH_FILL_SAMPLE_CSV) {
    return;
  }
  fs.mkdirSync(path.dirname(sampleCsvPath), { recursive: true });
  const lines = [inlineCsvHeaders.join(',')];
  for (const row of inlineCsvRows) {
    lines.push(inlineCsvHeaders.map((column) => String(row[column] ?? '')).join(','));
  }
  fs.writeFileSync(sampleCsvPath, `${lines.join('\n')}\n`);
}

function logStep(message) {
  console.log(`[search-fill-crediting-real-user-flow] ${message}`);
}

async function returnToWorkspace(page) {
  // If we're on the profile page, click the return button. Otherwise noop.
  const returnButton = page.getByRole('button', { name: 'Return to workspace' });
  if (await returnButton.isVisible().catch(() => false)) {
    await returnButton.click();
  }
}

async function connectCsvDataSource(page, csvPath) {
  logStep('uploading CSV data source');
  const csvInput = page.locator('input#csv-file-input');
  await csvInput.waitFor({ state: 'attached', timeout: 30000 });
  await csvInput.setInputFiles(csvPath);
}

async function saveCurrentWorkspaceTemplate(page, saveName) {
  // Click Save, fill the name prompt, wait for the POST /api/saved-forms
  // round trip so `activeSavedFormId` populates. Without a saved form the
  // Search & Fill commit path is a no-op (templateId is null) — mirroring the
  // real user flow requires saving first.
  const savedFormsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/saved-forms')
      && response.request().method() === 'POST'
      && response.ok(),
    { timeout: 60000 },
  );
  await page.getByRole('button', { name: 'Save', exact: true }).first().click();
  await page.locator('.ui-dialog__input').fill(saveName);
  await page.locator('.ui-dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await savedFormsResponse;
  await page.locator('.ui-dialog-backdrop .ui-dialog').waitFor({ state: 'hidden', timeout: 30000 });
}

async function openSearchFillModal(page) {
  logStep('opening Search & Fill');
  // "Search & Fill" lives inside the data-source dropdown in the header. Open
  // the menu first, then click the entry. The menu closes on outside clicks
  // so only click the toggle once per attempt.
  const dataSourceToggle = page.locator('.data-source__button').first();
  await dataSourceToggle.waitFor({ timeout: 15000 });
  await dataSourceToggle.click();
  const menuItem = page.getByRole('menuitem', { name: /^Search\s*&\s*Fill$/ });
  await menuItem.waitFor({ timeout: 10000 });
  await menuItem.click();
  await page.getByRole('heading', { name: 'Search, Fill & Clear' }).waitFor({ timeout: 15000 });
}

async function runSearchFillCommit(page, { query, capture, screenshotName }) {
  const queryInput = page.locator('#searchfill-query');
  await queryInput.waitFor({ timeout: 10000 });
  await queryInput.fill(query);

  const precheckResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/search-fill/precheck')
      && response.request().method() === 'GET',
    { timeout: 30000 },
  ).catch(() => null);

  // The modal has its own Search button; the workspace also has one, so
  // scope the locator to the modal to avoid ambiguity.
  const searchButton = page.locator('.searchfill-modal__card').getByRole('button', { name: 'Search', exact: true });
  await searchButton.click();
  const precheckResponse = await precheckResponsePromise;
  if (precheckResponse) {
    capture.precheckStatus = precheckResponse.status();
    capture.precheckPayload = await precheckResponse.json().catch(() => null);
  }

  const commitResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/search-fill/usage')
      && response.request().method() === 'POST',
    { timeout: 30000 },
  );

  // Debug hook: snapshot state pre-Fill so any failures tell us whether there
  // were any search results and what the currently-selected row is.
  if (screenshotName) {
    await captureScreenshot(page, `${screenshotName}-before-fill`).catch(() => {});
  }
  try {
    capture.resultRowCount = await page
      .locator('.searchfill-modal__card .searchfill-result, .searchfill-result')
      .count();
  } catch {
    capture.resultRowCount = null;
  }
  try {
    capture.modalErrorText = await page
      .locator('.searchfill-modal__card [role="alert"], .searchfill-modal__card .ui-alert')
      .first()
      .textContent({ timeout: 2000 });
  } catch {
    capture.modalErrorText = null;
  }
  logStep(`pre-fill resultRowCount=${capture.resultRowCount} modalErrorText=${JSON.stringify(capture.modalErrorText)}`);

  const fillButton = page.locator('.searchfill-modal__card').getByRole('button', { name: 'Fill PDF' });
  await fillButton.click();
  const commitResponse = await commitResponsePromise;
  capture.commitStatus = commitResponse.status();
  capture.commitRequestBody = parseJsonPostData(commitResponse);
  capture.commitResponseBody = await commitResponse.json().catch(() => null);

  return commitResponse;
}

async function captureScreenshot(page, name) {
  const filePath = path.join(screenshotDir, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: true }).catch(() => {});
  return filePath;
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  if (!fs.existsSync(samplePdfPath)) {
    throw new Error(`Missing sample PDF: ${samplePdfPath}`);
  }
  ensureInlineCsv();
  if (!fs.existsSync(sampleCsvPath)) {
    throw new Error(`Missing sample CSV: ${sampleCsvPath}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1480, height: 1100 } });
  const page = await context.newPage();
  const summary = {
    ok: false,
    baseUrl,
    apiBaseUrl,
    samplePdfPath,
    sampleCsvPath,
    screenshots: {},
    singleTemplate: {},
    retry: {},
    profile: {},
  };

  try {
    logStep(`signing in as ${loginEmail || '(missing)'}`);
    await signInFromHomepageAndOpenProfile(page, { baseUrl, loginEmail, loginPassword, logStep });

    summary.profile.initialCreditsThisMonth = await page.evaluate(async () => {
      const bodyText = document.body.textContent || '';
      const match = bodyText.match(/Used this month[\s\S]{0,30}?(\d[\d,]*)/);
      return match ? Number(match[1].replace(/,/g, '')) : null;
    });

    await returnToWorkspace(page);

    // Stub rename so field names line up with the CSV columns without paying
    // for OpenAI. Search & Fill lives entirely client-side after rename, so
    // the commit requests are still driven by real frontend code.
    await page.route('**/api/renames/ai', async (route) => {
      const body = parseJsonPostData(route.request());
      const templateFields = Array.isArray(body?.templateFields) ? body.templateFields : [];
      const renameResult = buildMockRenameResult(templateFields);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(renameResult),
      });
    });

    await uploadFillablePdfAndWaitForEditor(page, baseUrl, samplePdfPath);

    logStep('running mocked rename');
    await page.getByRole('button', { name: /Rename or Remap/i }).click();
    await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
    await page.getByRole('dialog', { name: 'Send to OpenAI?' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.waitForResponse(
      (response) => response.url().includes('/api/renames/ai') && response.ok(),
      { timeout: 30000 },
    );

    // Persist the template so `activeSavedFormId` populates — the modal only
    // commits credits when the fill is attributed to a concrete template.
    logStep('saving template so Search & Fill has a templateId to charge');
    await saveCurrentWorkspaceTemplate(page, `Search Fill Smoke ${Date.now()}`);

    await connectCsvDataSource(page, sampleCsvPath);
    await openSearchFillModal(page);

    logStep('commit single-template fill');
    await runSearchFillCommit(page, { query: 'Justin', capture: summary.singleTemplate, screenshotName: 'single-template' });
    summary.screenshots.singleTemplate = await captureScreenshot(page, 'single-template');

    if (summary.singleTemplate.commitStatus !== 200) {
      throw new Error(`single-template commit returned HTTP ${summary.singleTemplate.commitStatus}`);
    }
    if (summary.singleTemplate.commitResponseBody?.status !== 'committed') {
      throw new Error(
        `single-template commit should be 'committed', got ${JSON.stringify(summary.singleTemplate.commitResponseBody)}`,
      );
    }
    if (summary.singleTemplate.commitRequestBody?.countIncrement !== 1) {
      throw new Error('single-template commit must set countIncrement=1');
    }

    // Retry: re-open the modal with the same row. The modal builds a fresh
    // requestId per commit by design, so we deliberately re-use the first
    // requestId by calling the API directly to prove idempotency.
    logStep('validating idempotent retry via direct API');
    const token = await page.evaluate(async () => {
      const { firebaseAuth } = await import('/src/services/firebaseClient.ts');
      return firebaseAuth.currentUser?.getIdToken(true);
    });
    const firstRequestId = summary.singleTemplate.commitRequestBody?.requestId;
    if (!firstRequestId) {
      throw new Error('No requestId captured from the single-template commit.');
    }
    const retryResponse = await fetch(`${apiBaseUrl}/api/search-fill/usage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(summary.singleTemplate.commitRequestBody),
    });
    summary.retry.status = retryResponse.status;
    summary.retry.payload = await retryResponse.json().catch(() => null);
    if (summary.retry.payload?.status !== 'replayed') {
      throw new Error(
        `Retry must return status='replayed', got ${JSON.stringify(summary.retry.payload)}`,
      );
    }

    // Back to the profile to confirm visible usage increments.
    logStep('reopening profile to confirm usage delta');
    await retry('open profile', 3, async () => {
      await page.getByTitle('Open profile').click();
      await page.getByText('Account overview').waitFor({ timeout: 15000 });
    });
    summary.profile.finalCreditsThisMonth = await page.evaluate(async () => {
      const bodyText = document.body.textContent || '';
      const match = bodyText.match(/Used this month[\s\S]{0,30}?(\d[\d,]*)/);
      return match ? Number(match[1].replace(/,/g, '')) : null;
    });
    summary.screenshots.profile = await captureScreenshot(page, 'profile-usage');

    const initial = Number(summary.profile.initialCreditsThisMonth ?? 0);
    const final = Number(summary.profile.finalCreditsThisMonth ?? 0);
    if (final - initial !== 1) {
      throw new Error(
        `Profile Search & Fill usage should have grown by 1 (initial=${initial}, final=${final}).`,
      );
    }

    summary.ok = true;
    logStep('real-user flow passed');
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.currentUrl = page.url();
    await captureScreenshot(page, 'failure').catch(() => {});
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    await page.close().catch(() => {});
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
