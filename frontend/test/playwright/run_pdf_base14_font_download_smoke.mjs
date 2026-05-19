import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  createCustomToken,
  createHybridEmailUser,
  deleteCurrentUserHarness,
  deleteUserByInitialToken,
  signInWithCustomTokenHarness,
  signOutHarness,
} from './helpers/downgradeFixture.mjs';
import {
  openUploadView,
  setGodRole,
  uploadFillablePdfAndWaitForEditor,
} from './helpers/workspaceFixture.mjs';

const repoRoot = process.cwd();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(repoRoot, 'output/playwright/pdf-base14-fonts');
const screenshotPath = path.join(artifactDir, 'workspace-font-controls.png');
const summaryPath = path.join(artifactDir, 'pdf-base14-font-download-smoke.json');
const samplePdfPath = path.resolve(
  repoRoot,
  process.env.PW_PDF_FONT_SAMPLE || 'quickTestFiles/cms1500_06_03d2696ed5.pdf',
);

function logStep(message) {
  console.log(`[pdf-base14-font-smoke] ${message}`);
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function retry(label, attempts, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`[pdf-base14-font-smoke] ${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function runBackendPython(script, extraEnv = {}) {
  const backendEnvFile = process.env.PW_BACKEND_ENV_FILE || 'env/backend.dev.env';
  const bashScript = `
set -euo pipefail
set -a
source "$PW_BACKEND_ENV_FILE"
set +a
source scripts/_load_firebase_secret.sh
load_firebase_secret
backend/.venv/bin/python - <<'PY'
${script}
PY
`;
  return execFileSync('bash', ['-lc', bashScript], {
    cwd: repoRoot,
    env: { ...process.env, PW_BACKEND_ENV_FILE: backendEnvFile, ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function cleanupUserWorkspace(uid) {
  runBackendPython(
    `
import os

from backend.firebaseDB.firebase_service import get_firestore_client, init_firebase
from backend.firebaseDB.group_database import list_groups, delete_group
from backend.firebaseDB.template_database import list_templates
from backend.services.template_cleanup_service import delete_saved_form_assets

uid = os.environ["PW_UID"]
init_firebase()
for group in list_groups(uid):
    delete_group(group.id, uid)
for template in list_templates(uid):
    delete_saved_form_assets(template.id, uid, hard_delete_link_records=True)
client = get_firestore_client()
client.collection("app_users").document(uid).delete()
print("ok")
`,
    { PW_UID: uid },
  );
}

function inspectPdfFonts(pdfPath) {
  const output = runBackendPython(
    `
import json
import os
from pathlib import Path

from pypdf import PdfReader

pdf_path = Path(os.environ["PW_PDF_PATH"])
reader = PdfReader(str(pdf_path))
base_fonts = set()
appearance_text = []
default_appearance = []
page_content = []

def read_stream_data(value):
    if not value:
        return b""
    try:
        value = value.get_object()
    except AttributeError:
        pass
    if hasattr(value, "get_data"):
        return value.get_data()
    if isinstance(value, list):
        chunks = []
        for item in value:
            chunks.append(read_stream_data(item))
        return b"\\n".join(chunks)
    return b""

def inspect_font_dict(fonts):
    if not fonts:
        return
    try:
        fonts = fonts.get_object()
    except AttributeError:
        pass
    for font_ref in fonts.values():
        try:
            font_obj = font_ref.get_object()
        except AttributeError:
            font_obj = font_ref
        base_font = font_obj.get("/BaseFont") if hasattr(font_obj, "get") else None
        if base_font:
            base_fonts.add(str(base_font))

acroform = reader.trailer.get("/Root", {}).get("/AcroForm")
if acroform:
    acroform = acroform.get_object()
    default_appearance.append(str(acroform.get("/DA", "")))
    resources = acroform.get("/DR")
    if resources:
        resources = resources.get_object()
        inspect_font_dict(resources.get("/Font"))
    for field_ref in acroform.get("/Fields", []):
        field = field_ref.get_object()
        default_appearance.append(str(field.get("/DA", "")))
        appearance = field.get("/AP")
        if appearance and "/N" in appearance:
            normal = appearance["/N"].get_object()
            data = read_stream_data(normal)
            appearance_text.append(data.decode("latin-1", "ignore"))
            resources = normal.get("/Resources")
            if resources:
                resources = resources.get_object()
                inspect_font_dict(resources.get("/Font"))

for page in reader.pages:
    resources = page.get("/Resources")
    if resources:
        resources = resources.get_object()
        inspect_font_dict(resources.get("/Font"))
    contents = page.get_contents()
    if contents:
        data = read_stream_data(contents)
        page_content.append(data.decode("latin-1", "ignore"))

raw = pdf_path.read_bytes().decode("latin-1", "ignore")
print(json.dumps({
    "baseFonts": sorted(base_fonts),
    "defaultAppearance": default_appearance,
    "appearanceText": appearance_text,
    "pageContent": page_content,
    "rawContainsTimesRoman": "Times-Roman" in raw,
    "rawContainsCourierBold": "Courier-Bold" in raw,
    "rawContainsDullyFontTimesRoman": "DullyFontTimesRoman" in raw,
    "rawContainsDullyFontCourierBold": "DullyFontCourierBold" in raw,
}, sort_keys=True))
`,
    { PW_PDF_PATH: pdfPath },
  );
  return JSON.parse(output.split('\n').pop());
}

function assertPdfHasFont(inspection, fontName, resourceName) {
  const combinedText = [
    ...inspection.baseFonts,
    ...inspection.defaultAppearance,
    ...inspection.appearanceText,
    ...inspection.pageContent,
  ].join('\n');
  const rawHasTimesRoman = fontName === '/Times-Roman' && (
    inspection.rawContainsTimesRoman || inspection.rawContainsDullyFontTimesRoman
  );
  const rawHasCourierBold = fontName === '/Courier-Bold' && (
    inspection.rawContainsCourierBold || inspection.rawContainsDullyFontCourierBold
  );
  if (
    !combinedText.includes(fontName)
    && !combinedText.includes(resourceName)
    && !rawHasTimesRoman
    && !rawHasCourierBold
  ) {
    throw new Error(`Expected PDF to include ${fontName} or ${resourceName}. Inspection: ${JSON.stringify(inspection)}`);
  }
}

function summarizePdfInspection(inspection) {
  return {
    baseFonts: inspection.baseFonts,
    defaultAppearanceCount: inspection.defaultAppearance.length,
    appearanceStreamCount: inspection.appearanceText.length,
    pageContentStreamCount: inspection.pageContent.length,
    rawContainsTimesRoman: inspection.rawContainsTimesRoman,
    rawContainsCourierBold: inspection.rawContainsCourierBold,
    rawContainsDullyFontTimesRoman: inspection.rawContainsDullyFontTimesRoman,
    rawContainsDullyFontCourierBold: inspection.rawContainsDullyFontCourierBold,
  };
}

function renderFirstPage(pdfPath, label) {
  const prefix = path.join(artifactDir, label);
  execFileSync('pdftoppm', ['-png', '-singlefile', '-f', '1', '-l', '1', pdfPath, prefix], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const pngPath = `${prefix}.png`;
  if (!fs.existsSync(pngPath)) {
    throw new Error(`Expected rendered PNG at ${pngPath}`);
  }
  return pngPath;
}

async function selectFieldRow(page, index) {
  const rows = page.locator('.field-list .field-row');
  await rows.nth(index).waitFor({ timeout: 60000 });
  const row = rows.nth(index);
  const fieldName = String(await row.locator('.field-row__name').textContent() || '').trim();
  await row.click();
  await page.locator('#field-type').waitFor({ timeout: 30000 });
  await page.locator('#field-type').selectOption('text');
  return fieldName;
}

async function fillSelectedField(page, value) {
  await page.getByRole('button', { name: 'Fill', exact: true }).click();
  const activeInput = page.locator('.field-input-box--active input.field-input[type="text"]').first();
  await activeInput.waitFor({ timeout: 30000 });
  await activeInput.fill(value);
  await activeInput.press('Tab');
}

async function downloadPdf(page, mode, label) {
  const downloadButton = page.getByRole('button', { name: 'Download', exact: true }).first();
  await downloadButton.click();
  const downloadPromise = page.waitForEvent('download', { timeout: 120000 });
  await page.getByText(mode === 'flat' ? 'Download flat PDF' : 'Download editable PDF').click();
  const download = await downloadPromise;
  const outputPath = path.join(artifactDir, `${label}.pdf`);
  await download.saveAs(outputPath);
  const size = fs.statSync(outputPath).size;
  if (size < 500) {
    throw new Error(`Downloaded PDF is suspiciously small: ${outputPath} (${size} bytes)`);
  }
  return outputPath;
}

async function submitSavePrompt(page, saveName) {
  const saveRequest = page.waitForResponse((response) => (
    response.url().includes('/api/saved-forms')
    && response.request().method() === 'POST'
    && response.ok()
  ), { timeout: 120000 });
  await page.locator('.ui-dialog__input').fill(saveName);
  await page.locator('.ui-dialog').getByRole('button', { name: 'Save', exact: true }).click();
  const response = await saveRequest;
  const payload = await response.json();
  await page.locator('.ui-dialog-backdrop .ui-dialog').waitFor({ state: 'hidden', timeout: 30000 });
  return payload;
}

async function readSelectValue(page, selector) {
  await page.locator(selector).waitFor({ timeout: 10000 });
  return page.locator(selector).evaluate((element) => {
    if (!(element instanceof HTMLSelectElement)) {
      throw new Error(`Expected ${selector} to resolve to a select.`);
    }
    return element.value;
  });
}

async function main() {
  if (!fs.existsSync(samplePdfPath)) {
    throw new Error(`Missing sample PDF: ${samplePdfPath}`);
  }
  fs.mkdirSync(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    acceptDownloads: true,
  });
  const page = await context.newPage();

  let userFixture = null;
  let fixtureUid = null;

  try {
    logStep('creating temporary verified Firebase user');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    userFixture = await createHybridEmailUser(page);
    fixtureUid = userFixture.uid;
    setGodRole(userFixture.email);

    logStep('signing in with custom token');
    await signInWithCustomTokenHarness(page, createCustomToken(fixtureUid));

    logStep('uploading fillable PDF');
    await uploadFillablePdfAndWaitForEditor(page, baseUrl, samplePdfPath);

    logStep('setting global and per-field font choices');
    await page.locator('#global-field-font').selectOption('Times-Roman');
    const overrideFieldName = await selectFieldRow(page, 0);
    await page.locator('#field-font').selectOption('Courier-Bold');
    const globalFieldName = await selectFieldRow(page, 1);
    await page.locator('#field-font').selectOption('global');

    logStep('entering field values for visible PDF appearance checks');
    await page.locator('.field-list .field-row').nth(0).click();
    await fillSelectedField(page, 'Courier Bold Smoke');
    await page.locator('.field-list .field-row').nth(1).click();
    await fillSelectedField(page, 'Times Roman Smoke');

    await page.screenshot({ path: screenshotPath, fullPage: true });

    logStep('downloading editable and flat PDFs');
    const editablePdfPath = await downloadPdf(page, 'editable', 'pdf-base14-editable');
    const flatPdfPath = await downloadPdf(page, 'flat', 'pdf-base14-flat');

    logStep('inspecting downloaded PDF font resources');
    const editableInspection = inspectPdfFonts(editablePdfPath);
    const flatInspection = inspectPdfFonts(flatPdfPath);
    assertPdfHasFont(editableInspection, '/Times-Roman', '/Time');
    assertPdfHasFont(editableInspection, '/Courier-Bold', '/CoBo');
    assertPdfHasFont(flatInspection, '/Times-Roman', '/Time');
    assertPdfHasFont(flatInspection, '/Courier-Bold', '/CoBo');

    logStep('rendering downloaded PDFs to PNG');
    const editablePngPath = renderFirstPage(editablePdfPath, 'pdf-base14-editable-page1');
    const flatPngPath = renderFirstPage(flatPdfPath, 'pdf-base14-flat-page1');

    const saveName = `PDF Base14 Font Smoke ${Date.now()}`;
    logStep(`saving template as ${saveName}`);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const savePayload = await submitSavePrompt(page, saveName);
    if (!savePayload?.id) {
      throw new Error(`Save response did not include an id: ${JSON.stringify(savePayload)}`);
    }

    logStep('reopening saved template and checking hydrated font controls');
    await page.goto(`${baseUrl}/ui/forms/${encodeURIComponent(savePayload.id)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await retry('saved template editor hydrates', 6, async () => {
      await page.locator('#global-field-font').waitFor({ timeout: 15000 });
      await page.locator('.field-list .field-row').first().waitFor({ timeout: 15000 });
    });
    await retry('global font hydrates', 4, async () => {
      const value = await readSelectValue(page, '#global-field-font');
      if (value !== 'Times-Roman') {
        throw new Error(`Expected global font Times-Roman after reopen, found ${value}`);
      }
    });
    await page.locator('.field-list .field-row').filter({ hasText: overrideFieldName }).first().click();
    await retry('field override hydrates', 4, async () => {
      const value = await readSelectValue(page, '#field-font');
      if (value !== 'Courier-Bold') {
        throw new Error(`Expected ${overrideFieldName} override Courier-Bold after reopen, found ${value}`);
      }
    });
    await page.locator('.field-list .field-row').filter({ hasText: globalFieldName }).first().click();
    await retry('field global choice hydrates', 4, async () => {
      const value = await readSelectValue(page, '#field-font');
      if (value !== 'global') {
        throw new Error(`Expected ${globalFieldName} to inherit global font after reopen, found ${value}`);
      }
    });

    const summary = {
      ok: true,
      uid: fixtureUid,
      email: userFixture.email,
      savedFormId: savePayload.id,
      savedFormName: saveName,
      overrideFieldName,
      globalFieldName,
      editablePdfPath,
      flatPdfPath,
      editablePngPath,
      flatPngPath,
      screenshotPath,
      summaryPath,
      editableInspection: summarizePdfInspection(editableInspection),
      flatInspection: summarizePdfInspection(flatInspection),
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    logStep('PASSED');
  } finally {
    if (userFixture) {
      try {
        await deleteCurrentUserHarness(page);
      } catch {
        try {
          await deleteUserByInitialToken(page, userFixture.apiKey, userFixture.initialIdToken);
        } catch {}
      }
      try {
        await signOutHarness(page);
      } catch {}
    }
    if (fixtureUid) {
      try {
        cleanupUserWorkspace(fixtureUid);
      } catch (error) {
        console.warn(`[pdf-base14-font-smoke] cleanup failed for ${fixtureUid}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await page.close();
    await context.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
