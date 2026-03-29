import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'openai-rename-smoke.png');
const summaryPath = path.join(artifactDir, 'openai-rename-smoke.json');

async function mountHarness(page, config = {}) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async (harnessConfig) => {
    window.__PW_RENAME_CONFIG__ = harnessConfig;
    await import('/src/testSupport/playwrightRenameHarness.tsx');
  }, config);
}

async function getHarnessState(page) {
  return page.evaluate(() => window.__getRenameHarnessState__());
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1480, height: 1100 } });

  try {
    await mountHarness(page);
    await page.getByRole('button', { name: 'Rename' }).waitFor({ timeout: 30000 });

    await page.getByRole('button', { name: 'Rename' }).click();
    await page.getByRole('dialog', { name: 'Send to OpenAI?' }).waitFor({ timeout: 10000 });
    await page.getByText('Row data and field input values are not sent.').waitFor({ timeout: 10000 });

    const stateBeforeCancel = await getHarnessState(page);
    if (stateBeforeCancel.renameCalls.length !== 0) {
      throw new Error(`Rename should not call the API before confirmation. Calls: ${JSON.stringify(stateBeforeCancel.renameCalls)}`);
    }

    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('dialog', { name: 'Send to OpenAI?' }).waitFor({ state: 'hidden', timeout: 10000 });

    const stateAfterCancel = await getHarnessState(page);
    if (stateAfterCancel.renameCalls.length !== 0) {
      throw new Error(`Rename cancel should not call the API. Calls: ${JSON.stringify(stateAfterCancel.renameCalls)}`);
    }

    await page.getByRole('button', { name: 'Rename' }).click();
    await page.getByRole('dialog', { name: 'Send to OpenAI?' }).waitFor({ timeout: 10000 });
    await page.getByRole('button', { name: 'Continue' }).click();

    await page.getByRole('button', { name: 'Renamed' }).waitFor({ timeout: 10000 });
    await page.getByText('Rename only standardizes field names.').waitFor({ timeout: 10000 });
    await page.getByText('patient_first_name (text)').waitFor({ timeout: 10000 });
    await page.getByText('patient_consent_yes (checkbox)').waitFor({ timeout: 10000 });
    await page.getByTestId('checkbox-rule-count').waitFor({ timeout: 10000 });

    const finalState = await getHarnessState(page);
    if (finalState.renameCalls.length !== 1) {
      throw new Error(`Expected exactly one rename API call. Calls: ${JSON.stringify(finalState.renameCalls)}`);
    }
    const renamePayload = finalState.renameCalls[0] || {};
    if (renamePayload.sessionId !== 'session_playwright_rename') {
      throw new Error(`Unexpected rename session id: ${JSON.stringify(renamePayload)}`);
    }
    const templateFields = Array.isArray(renamePayload.templateFields) ? renamePayload.templateFields : [];
    if (templateFields.length !== 2 || templateFields[0]?.name !== 'field_1' || templateFields[1]?.name !== 'field_2') {
      throw new Error(`Unexpected rename template fields: ${JSON.stringify(templateFields)}`);
    }
    if (finalState.checkboxRuleCount !== 1) {
      throw new Error(`Expected checkbox rule count 1. State: ${JSON.stringify(finalState)}`);
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const summary = {
      ok: true,
      screenshotPath,
      summaryPath,
      renameCallCount: finalState.renameCalls.length,
      renamedFields: finalState.fields.map((field) => field.name),
      checkboxRuleCount: finalState.checkboxRuleCount,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
