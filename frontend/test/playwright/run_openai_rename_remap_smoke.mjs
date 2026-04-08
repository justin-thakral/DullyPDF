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
  buildMockMappingResult,
  buildMockRenameResult,
  collectFieldNames,
  parseJsonPostData,
  pollOpenAiJob,
  repoRoot,
  retry,
  setGodRole,
  uploadFillablePdfAndWaitForEditor,
} from './helpers/workspaceFixture.mjs';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'openai-rename-remap-smoke.png');
const summaryPath = path.join(artifactDir, 'openai-rename-remap-smoke.json');
const remapSamplePdfPath = path.join(
  repoRoot,
  'quickTestFiles/dentalintakeform_d1c394f594.pdf',
);
const mockExpensiveAi = /^true$/i.test(process.env.PLAYWRIGHT_MOCK_EXPENSIVE_AI || '');

function logStep(message) {
  console.log(`[openai-rename-remap-real-flow] ${message}`);
}

function waitForLocalBackend() {
  execFileSync('bash', ['-lc', 'curl --silent --fail "$PW_API_BASE_URL/api/health" >/dev/null'], {
    cwd: repoRoot,
    env: { ...process.env, PW_API_BASE_URL: apiBaseUrl },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function buildSchemaFilePath() {
  const schemaPath = path.join(artifactDir, 'openai-rename-remap-schema.txt');
  fs.writeFileSync(
    schemaPath,
    [
      'full_name:string',
      'date:date',
      'signature_name:string',
      'phone:string',
      'email:string',
    ].join('\n'),
    'utf8',
  );
  return schemaPath;
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1480, height: 1100 } });
  const schemaPath = buildSchemaFilePath();
  const capture = {
    schemaCreate: null,
    combinedKickoff: null,
    combinedRequest: null,
    combinedResult: null,
  };

  let userFixture = null;
  let results = {};
  try {
    waitForLocalBackend();
    logStep('creating temporary Firebase user');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    userFixture = await createHybridEmailUser(page);
    logStep(`promoting ${userFixture.email} to god role`);
    setGodRole(userFixture.email);
    logStep('signing in with custom token');
    await signInWithCustomTokenHarness(page, createCustomToken(userFixture.uid));
    logStep('uploading real fillable PDF template');
    await uploadFillablePdfAndWaitForEditor(page, baseUrl, remapSamplePdfPath);

    const initialFieldNames = await collectFieldNames(page);
    if (initialFieldNames.length === 0) {
      throw new Error('Expected visible fields before schema mapping.');
    }

    logStep('uploading real TXT schema');
    const schemaCreatePromise = page.waitForResponse((response) => {
      return response.request().method() === 'POST'
        && response.url().includes('/api/schemas')
        && response.ok();
    }, { timeout: 30000 });
    await page.getByLabel('Upload TXT schema file').setInputFiles(schemaPath);
    const schemaCreateResponse = await schemaCreatePromise;
    capture.schemaCreate = await schemaCreateResponse.json();
    if (!capture.schemaCreate?.schemaId) {
      throw new Error(`Schema upload did not return a schemaId: ${JSON.stringify(capture.schemaCreate)}`);
    }

    logStep('running real Rename + Map flow');
    await page.getByRole('button', { name: /Rename or Remap/i }).click();
    await page.getByRole('menuitem', { name: 'Rename + Map', exact: true }).click();
    await page.getByRole('dialog', { name: 'Send to OpenAI?' }).waitFor({ timeout: 10000 });
    if (mockExpensiveAi) {
      logStep('mocking expensive OpenAI rename + map request');
      await page.route('**/api/rename-remap/ai', async (route) => {
        const combinedRequest = parseJsonPostData(route.request());
        const templateFields = Array.isArray(combinedRequest?.templateFields) ? combinedRequest.templateFields : [];
        const renameResult = buildMockRenameResult(templateFields);
        const mappingSourceFields = Array.isArray(renameResult?.fields) ? renameResult.fields : templateFields;
        const mappingResult = buildMockMappingResult(mappingSourceFields);
        const mappingByOriginalName = new Map(
          (mappingResult?.mappingResults?.mappings || []).map((mapping) => [
            String(mapping?.originalPdfField || ''),
            mapping,
          ]),
        );
        const combinedFields = mappingSourceFields.map((field) => {
          const mapping = mappingByOriginalName.get(String(field?.name || ''));
          if (!mapping?.pdfField) return field;
          return {
            ...field,
            name: String(mapping.pdfField),
            mappingConfidence: Number(mapping.confidence) || 0.97,
          };
        });
        const combinedResult = {
          success: true,
          status: 'complete',
          fields: combinedFields,
          checkboxRules: Array.isArray(renameResult?.checkboxRules) ? renameResult.checkboxRules : [],
          mappingResults: mappingResult.mappingResults,
        };
        capture.combinedRequest = combinedRequest;
        capture.combinedKickoff = combinedResult;
        capture.combinedResult = combinedResult;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(combinedResult),
        });
      }, { times: 1 });
    }
    const combinedRequestPromise = page.waitForRequest((request) => {
      return request.method() === 'POST'
        && request.url().includes('/api/rename-remap/ai');
    }, { timeout: 180000 });
    await page.getByRole('button', { name: 'Continue' }).click();

    const combinedRequest = await combinedRequestPromise;
    const combinedResponse = await combinedRequest.response();
    if (!combinedResponse || !combinedResponse.ok()) {
      const responseText = combinedResponse ? await combinedResponse.text() : 'missing response';
      throw new Error(`Rename + Map kickoff request did not return a successful response: ${responseText}`);
    }
    capture.combinedKickoff = await combinedResponse.json();
    capture.combinedRequest = parseJsonPostData(combinedRequest);
    if (capture.combinedKickoff?.success && capture.combinedKickoff?.mappingResults) {
      capture.combinedResult = capture.combinedKickoff;
    }
    if (!capture.combinedKickoff?.success) {
      throw new Error(`Rename + Map kickoff response was incomplete: ${JSON.stringify(capture.combinedKickoff)}`);
    }
    if (!capture.combinedResult && capture.combinedKickoff?.jobId) {
      capture.combinedResult = await pollOpenAiJob(page, {
        apiBaseUrl,
        resource: 'rename-remap',
        jobId: String(capture.combinedKickoff.jobId),
      });
    }
    if (!capture.combinedResult) {
      throw new Error(
        `Rename + Map did not produce a final payload. Kickoff: ${JSON.stringify(capture.combinedKickoff)}`,
      );
    }

    if (!capture.combinedRequest?.sessionId) {
      throw new Error(`Rename + Map request should include a sessionId. Payload: ${JSON.stringify(capture.combinedRequest)}`);
    }
    if (capture.combinedRequest?.schemaId !== capture.schemaCreate.schemaId) {
      throw new Error(
        `Rename + Map request should use created schemaId ${capture.schemaCreate.schemaId}. Payload: ${JSON.stringify(capture.combinedRequest)}`,
      );
    }
    const mappingCount = Array.isArray(capture.combinedResult?.mappingResults?.mappings)
      ? capture.combinedResult.mappingResults.mappings.length
      : 0;
    if (mappingCount <= 0) {
      throw new Error(`Expected at least one mapping result. Payload: ${JSON.stringify(capture.combinedResult)}`);
    }
    const mappedFieldNames = (capture.combinedResult?.mappingResults?.mappings || [])
      .map((mapping) => String(mapping?.pdfField || '').trim())
      .filter(Boolean);
    if (mappedFieldNames.length === 0) {
      throw new Error(`Expected usable mapped field names. Payload: ${JSON.stringify(capture.combinedResult)}`);
    }

    const finalFieldNames = await retry('wait for mapped field names in the editor', 40, async () => {
      const names = await collectFieldNames(page);
      if (names.length === 0) {
        throw new Error('Waiting for visible fields after Rename + Map.');
      }
      const anyMappedNameVisible = names.some((name) => mappedFieldNames.includes(name));
      if (!anyMappedNameVisible) {
        throw new Error(`Waiting for mapped field labels to appear in the editor. Visible names: ${JSON.stringify(names.slice(0, 8))}`);
      }
      return names;
    });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    results = {
      ok: true,
      userEmail: userFixture.email,
      screenshotPath,
      summaryPath,
      mockExpensiveAi,
      schemaId: capture.schemaCreate.schemaId,
      initialFieldCount: initialFieldNames.length,
      finalFieldCount: finalFieldNames.length,
      renameFieldCount: Array.isArray(capture.combinedResult?.fields) ? capture.combinedResult.fields.length : 0,
      mappingCount,
      renamedFieldsSample: (capture.combinedResult?.fields || []).map((field) => String(field?.name || '')).filter(Boolean).slice(0, 8),
      mappedFieldsSample: finalFieldNames.slice(0, 8),
    };
  } catch (error) {
    results = {
      ...results,
      ok: false,
    };
    results.error = error instanceof Error ? error.message : String(error);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
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
    await page.close();
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));

  if (!results.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
