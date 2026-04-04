import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const repoRoot = process.cwd();
export const defaultFillableSamplePdfPath = path.resolve(
  repoRoot,
  'samples/fieldDetecting/pdfs/native/intake/new_patient_intake_form_fillable_badc6aa21d.pdf',
);

export function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

export async function retry(label, attempts, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }
      console.warn(`[playwright] ${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export function setGodRole(email) {
  execFileSync('bash', ['-lc', './scripts/set-role-dev.sh --email "$PW_EMAIL" --role god'], {
    cwd: repoRoot,
    env: { ...process.env, PW_EMAIL: email },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function openUploadView(page, baseUrl) {
  await retry('open upload view', 3, async () => {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    const uploadHeading = page.getByText('Upload PDF for Field Detection');
    if (await uploadHeading.isVisible().catch(() => false)) {
      return;
    }
    const tryNowButton = page.getByRole('button', { name: 'Try Now' });
    await tryNowButton.waitFor({ timeout: 30000 });
    await tryNowButton.click();
    await uploadHeading.waitFor({ timeout: 30000 });
  });
}

export async function waitForEditorReady(page) {
  await page.getByRole('button', { name: 'Save' }).waitFor({ timeout: 60000 });
  await page.locator('.field-list .field-row__name').first().waitFor({ timeout: 60000 });
}

export async function uploadFillablePdfAndWaitForEditor(page, baseUrl, pdfPath = defaultFillableSamplePdfPath) {
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`Missing sample fillable PDF: ${pdfPath}`);
  }
  await openUploadView(page, baseUrl);
  await page.getByLabel('Upload Fillable PDF Template').setInputFiles(pdfPath);
  await waitForEditorReady(page);
}

export async function collectFieldNames(page) {
  return page.locator('.field-list .field-row__name').evaluateAll((nodes) => {
    return nodes
      .map((node) => node.textContent?.trim() || '')
      .filter(Boolean);
  });
}
