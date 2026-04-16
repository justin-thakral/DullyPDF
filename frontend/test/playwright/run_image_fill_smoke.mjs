/**
 * Playwright smoke test for the "Fill from Images & Documents" feature.
 *
 * Prerequisites:
 *   - Dev stack running (frontend + backend)
 *   - DULLYPDF_E2E_EMAIL and DULLYPDF_E2E_PASSWORD set
 *   - quickTestFiles/ directory with test PDFs and testing.jpg
 *
 * Usage:
 *   DULLYPDF_E2E_EMAIL=... DULLYPDF_E2E_PASSWORD=... node frontend/test/playwright/run_image_fill_smoke.mjs
 *
 * The test iterates over every quickTestFiles PDF (except 72.pdf), uploads each
 * into the workspace for detection + rename, then opens the Image Fill dialog
 * and uploads Patient Information.pdf + testing.jpg as source documents.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const repoRoot = process.cwd();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(repoRoot, 'output/playwright');
const summaryPath = path.join(artifactDir, 'image-fill-smoke.json');

const email = requireEnv('DULLYPDF_E2E_EMAIL');
const password = requireEnv('DULLYPDF_E2E_PASSWORD');

// Source documents to fill from
const patientInfoPath = resolveRequiredPath('quickTestFiles/Patient Information.pdf');
const testingImagePath = resolveRequiredPath('quickTestFiles/testing.jpg');

// Template PDFs to test against (all except 72.pdf)
const templatePdfs = [
  'quickTestFiles/Patient Information.pdf',
  'quickTestFiles/cms1500_06_03d2696ed5.pdf',
  'quickTestFiles/dentalintakeform_d1c394f594.pdf',
  'quickTestFiles/new_patient_forms_1915ccb015.pdf',
].map((p) => ({
  path: resolveRequiredPath(p),
  name: path.basename(p),
}));

const results = [];

function logStep(message) {
  console.log(`[image-fill-smoke] ${message}`);
}

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function resolveRequiredPath(relativeOrAbsolutePath) {
  const resolved = path.resolve(repoRoot, relativeOrAbsolutePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Missing required file: ${resolved}`);
  }
  return resolved;
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function signIn(page) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => {
    const isVisible = (el) => {
      if (!(el instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const emailInput = document.querySelector('#auth-email');
    const uploadHeading = Array.from(document.querySelectorAll('*'))
      .find((el) => el.textContent?.trim() === 'Upload PDF for Field Detection');
    const tryNow = Array.from(document.querySelectorAll('button'))
      .find((btn) => btn.textContent?.trim() === 'Detect Fields & Open the Form Workspace');
    const signInBtn = Array.from(document.querySelectorAll('button'))
      .find((btn) => btn.textContent?.trim() === 'Sign in');
    return isVisible(emailInput) || isVisible(uploadHeading) || isVisible(tryNow) || isVisible(signInBtn);
  }, { timeout: 30000 });

  const emailField = page.getByLabel('Email');
  const uploadHeading = page.getByText('Upload PDF for Field Detection');

  const isAlreadyAtLogin = await emailField.isVisible().catch(() => false);
  if (!isAlreadyAtLogin) {
    const tryNow = page.getByRole('button', { name: 'Detect Fields & Open the Form Workspace' }).first();
    const headerSignIn = page.locator('.signin-button').first();
    if (await tryNow.isVisible().catch(() => false)) {
      await tryNow.click();
    } else if (await headerSignIn.isVisible().catch(() => false)) {
      await headerSignIn.click();
    } else if (await uploadHeading.isVisible().catch(() => false)) {
      return;
    } else {
      throw new Error('Unable to find a visible workspace entry button.');
    }
    await Promise.race([
      emailField.waitFor({ state: 'visible', timeout: 30000 }),
      uploadHeading.waitFor({ state: 'visible', timeout: 30000 }),
    ]);
  }
  if (await uploadHeading.isVisible().catch(() => false)) return;

  await emailField.fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Detect Fields & Open the Form Workspace' }).waitFor({ timeout: 30000 });
}

async function navigateToUploadView(page) {
  const uploadHeading = page.getByText('Upload PDF for Field Detection');
  if (await uploadHeading.isVisible().catch(() => false)) return;

  const homeButton = page.getByRole('button', { name: 'Home' });
  const tryNow = page.getByRole('button', { name: 'Detect Fields & Open the Form Workspace' });
  if (await homeButton.isVisible().catch(() => false)) {
    await homeButton.click();
    await sleep(500);
  }
  if (await tryNow.isVisible().catch(() => false)) {
    await tryNow.click();
    await sleep(500);
  }
  await uploadHeading.waitFor({ timeout: 15000 });
}

async function uploadAndDetect(page, pdfPath) {
  await navigateToUploadView(page);
  const fileInput = page.getByLabel('Upload PDF for Field Detection');
  await fileInput.setInputFiles(pdfPath);

  // Wait for processing to complete and editor to appear
  await page.waitForFunction(
    () => {
      const editor = document.querySelector('.editor-layout');
      return editor instanceof HTMLElement;
    },
    { timeout: 120000 },
  );
  await sleep(1000);
}

async function runRenameIfAvailable(page) {
  const renameButton = page.getByRole('button', { name: 'Rename' }).first();
  const hasRename = await renameButton.isVisible().catch(() => false);
  if (!hasRename) return false;

  const isDisabled = await renameButton.getAttribute('aria-disabled');
  if (isDisabled === 'true') return false;

  await renameButton.click();
  // Handle confirmation dialog if it appears
  const confirmButton = page.getByRole('button', { name: 'Continue' });
  const hasConfirm = await confirmButton.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasConfirm) {
    await confirmButton.click();
  }

  // Wait for rename to complete (button changes to "Renamed")
  await page.getByRole('button', { name: /Renamed|Rename/ }).waitFor({ timeout: 120000 });
  await sleep(1000);
  return true;
}

async function testImageFillForTemplate(page, templatePdf) {
  const templateResult = {
    template: templatePdf.name,
    uploaded: false,
    renamed: false,
    dialogOpened: false,
    documentsUploaded: false,
    extractionSent: false,
    fieldsExtracted: 0,
    error: null,
  };

  try {
    logStep(`Uploading template: ${templatePdf.name}`);
    await uploadAndDetect(page, templatePdf.path);
    templateResult.uploaded = true;

    // Rename fields
    logStep(`Renaming fields for: ${templatePdf.name}`);
    templateResult.renamed = await runRenameIfAvailable(page);

    // Look for "Fill from Images & Documents" button
    const imageFillButton = page.getByRole('button', { name: 'Fill from Images & Documents' });
    await imageFillButton.waitFor({ timeout: 10000 });
    logStep(`Opening image fill dialog for: ${templatePdf.name}`);
    await imageFillButton.click();

    // Verify dialog opened
    const dialogTitle = page.getByText('Fill from information extracted from images and documents');
    await dialogTitle.waitFor({ timeout: 10000 });
    templateResult.dialogOpened = true;

    // Verify warning is shown
    await page.getByText('Fields must be named before using this feature').waitFor({ timeout: 5000 });

    // Upload source documents via the Upload button
    const uploadButton = page.getByRole('button', { name: 'Upload' });
    await uploadButton.waitFor({ timeout: 5000 });

    // Use file chooser to upload both files
    const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 10000 });
    await uploadButton.click();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles([patientInfoPath, testingImagePath]);
    await sleep(500);

    // Verify document names appear
    await page.getByText('Patient Information.pdf').waitFor({ timeout: 5000 });
    await page.getByText('testing.jpg').waitFor({ timeout: 5000 });
    templateResult.documentsUploaded = true;

    // Click Send to trigger extraction
    const sendButton = page.getByRole('button', { name: 'Send' });
    await sendButton.waitFor({ timeout: 5000 });
    logStep(`Sending extraction request for: ${templatePdf.name}`);
    await sendButton.click();
    templateResult.extractionSent = true;

    // Wait for extraction to complete (loading spinner disappears, fields appear or error shows)
    await page.waitForFunction(
      () => {
        const spinner = document.querySelector('.image-fill-dialog__spinner');
        return !spinner;
      },
      { timeout: 180000 },
    );
    await sleep(500);

    // Count extracted fields
    const fieldRows = await page.locator('.image-fill-dialog__field-row').count();
    templateResult.fieldsExtracted = fieldRows;
    logStep(`Extracted ${fieldRows} fields for: ${templatePdf.name}`);

    // If fields were extracted, test the reject and edit controls
    if (fieldRows > 0) {
      // Test editing a field value
      const firstInput = page.locator('.image-fill-dialog__field-value').first();
      const originalValue = await firstInput.inputValue();
      await firstInput.fill('EDITED_VALUE');
      const editedValue = await firstInput.inputValue();
      if (editedValue !== 'EDITED_VALUE') {
        throw new Error(`Field value edit failed. Expected "EDITED_VALUE", got "${editedValue}"`);
      }
      // Restore original
      await firstInput.fill(originalValue);

      // Test rejecting a field
      const firstReject = page.getByRole('button', { name: 'Reject' }).first();
      await firstReject.click();
      const undoButton = page.getByRole('button', { name: 'Undo' }).first();
      await undoButton.waitFor({ timeout: 3000 });
      // Undo the rejection
      await undoButton.click();
    }

    // Take screenshot
    const screenshotName = `image-fill-${templatePdf.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(artifactDir, screenshotName), fullPage: true });

    // Close dialog via the X button
    const closeButton = page.getByLabel('Close image fill dialog');
    await closeButton.click();
    await dialogTitle.waitFor({ state: 'hidden', timeout: 5000 });

    logStep(`Completed: ${templatePdf.name} (${fieldRows} fields extracted)`);
  } catch (error) {
    templateResult.error = error instanceof Error ? error.message : String(error);
    logStep(`ERROR for ${templatePdf.name}: ${templateResult.error}`);

    // Take error screenshot
    const errorScreenshotName = `image-fill-error-${templatePdf.name.replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    await page.screenshot({ path: path.join(artifactDir, errorScreenshotName), fullPage: true }).catch(() => {});

    // Try to close dialog if still open
    const closeButton = page.getByLabel('Close image fill dialog');
    if (await closeButton.isVisible().catch(() => false)) {
      await closeButton.click().catch(() => {});
      await sleep(500);
    }
  }

  return templateResult;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1480, height: 1100 } });

  try {
    logStep('Signing in...');
    await signIn(page);
    logStep('Signed in.');

    for (const templatePdf of templatePdfs) {
      const result = await testImageFillForTemplate(page, templatePdf);
      results.push(result);
    }

    const allOk = results.every((r) => r.dialogOpened && r.documentsUploaded && r.extractionSent && !r.error);
    const totalFields = results.reduce((sum, r) => sum + r.fieldsExtracted, 0);

    const summary = {
      ok: allOk,
      summaryPath,
      templatesCount: templatePdfs.length,
      totalFieldsExtracted: totalFields,
      results,
    };

    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    logStep(`Summary: ${JSON.stringify(summary, null, 2)}`);

    if (!allOk) {
      const failedTemplates = results.filter((r) => r.error).map((r) => r.template);
      throw new Error(`Image fill smoke test failed for: ${failedTemplates.join(', ')}`);
    }

    logStep('All templates passed!');
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
