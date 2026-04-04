/**
 * Real integration Playwright test for the multi-signer envelope flow.
 *
 * This test hits the REAL backend (no API mocks). It:
 * 1. Creates a real Firebase user
 * 2. Signs in and navigates to the workspace
 * 3. Uploads a real PDF with signature fields
 * 4. Opens the signing dialog
 * 5. Verifies the current workflow/policy defaults
 * 6. Adds 2 recipients
 * 7. Saves 2 real signing drafts (POST /api/signing/requests — real)
 * 8. Sends the 2 real requests (POST /api/signing/requests/{id}/send — real)
 * 9. Verifies the backend returned the expected request data
 *
 * Requires: dev backend + frontend running on localhost:5173
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  createCustomToken,
  createHybridEmailUser,
  deleteCurrentUserHarness,
  deleteUserByInitialToken,
  signInWithCustomTokenHarness,
  signOutHarness,
} from './helpers/downgradeFixture.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(scriptDir, '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(frontendRoot, 'output/playwright');
const samplePdfPath = path.resolve(
  repoRoot,
  'quickTestFiles/cms1500_06_03d2696ed5.pdf',
);

function logStep(message) {
  console.log(`[envelope-real-flow] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForCaptureCount(label, getCount, expectedCount, attempts = 20) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const count = getCount();
    if (count >= expectedCount) {
      return;
    }
    if (attempt < attempts) {
      console.warn(`[envelope-real-flow] ${label} attempt ${attempt} saw ${count}/${expectedCount} captured responses`);
      await sleep(1000);
      continue;
    }
    throw new Error(`${label} timed out after ${attempts} attempts: expected ${expectedCount}, got ${count}`);
  }
}

async function main() {
  if (!fs.existsSync(samplePdfPath)) {
    throw new Error(`Missing sample PDF: ${samplePdfPath}`);
  }
  fs.mkdirSync(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });

  // Capture request API payloads for verification. The current signing flow
  // saves one request per recipient, so we collect arrays instead of a single envelope.
  const captured = {
    createPayloads: [],
    createResponses: [],
    sendResponses: [],
  };

  page.on('pageerror', (error) => {
    console.error(`[envelope-real-flow][pageerror] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });

  page.on('response', async (response) => {
    const url = response.url();
    const method = response.request().method();
    if (method === 'POST' && url.includes('/api/signing/requests') && !url.includes('/send')) {
      try {
        const payload = JSON.parse(response.request().postData() || '{}');
        const body = await response.json();
        captured.createPayloads.push(payload);
        captured.createResponses.push(body?.request || body);
      } catch {
        // Ignore malformed request/response bodies from unrelated calls.
      }
    }
    if (method === 'POST' && url.includes('/api/signing/requests/') && url.includes('/send')) {
      try {
        const body = await response.json();
        captured.sendResponses.push(body?.request || body);
      } catch {
        // Ignore malformed send responses.
      }
    }
  });

  let userFixture = null;

  try {
    // ---------------------------------------------------------------
    // Step 1: Create real Firebase user and sign in
    // ---------------------------------------------------------------
    logStep('opening frontend');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    logStep('creating Firebase test user');
    userFixture = await createHybridEmailUser(page);
    logStep(`created user: ${userFixture.email} (${userFixture.uid})`);

    const customToken = createCustomToken(userFixture.uid);
    await signInWithCustomTokenHarness(page, customToken);

    // ---------------------------------------------------------------
    // Step 2: Navigate to workspace and upload PDF
    // ---------------------------------------------------------------
    logStep('navigating to workspace');
    await page.goto(`${baseUrl}/ui`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Upload PDF for Field Detection').waitFor({ timeout: 30000 });

    logStep('uploading PDF with signature fields');
    await page.getByLabel('Upload Fillable PDF Template').setInputFiles(samplePdfPath);
    await page.getByRole('button', { name: 'Send PDF for Signature by email' }).waitFor({ timeout: 30000 });

    // ---------------------------------------------------------------
    // Step 3: Add a signature anchor via the editor
    // ---------------------------------------------------------------
    logStep('adding signature anchors in the editor');
    await page.locator('.panel-mode-chip').filter({ hasText: 'Signature' }).first().click();
    // Draw two signature fields at different positions
    await page.locator('[aria-label="Draw signature field"]').first().click({ position: { x: 160, y: 160 } });
    await sleep(500);
    await page.locator('[aria-label="Draw signature field"]').first().click({ position: { x: 160, y: 260 } });
    await sleep(500);

    // ---------------------------------------------------------------
    // Step 4: Open the signing dialog
    // ---------------------------------------------------------------
    logStep('opening signing dialog');
    const signingOptionsResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/signing/options')
        && response.request().method() === 'GET'
        && response.ok();
    }, { timeout: 15000 });
    await page.getByRole('button', { name: 'Send PDF for Signature by email' }).click();
    await signingOptionsResponse;
    await page.getByRole('heading', { name: 'Send PDF for Signature by email' }).waitFor({ timeout: 10000 });

    // ---------------------------------------------------------------
    // Step 5: Verify workflow/policy defaults
    // ---------------------------------------------------------------
    logStep('verifying workflow defaults');
    const workflowTabs = page.locator('.signature-request-dialog__mode-row').filter({ hasText: 'Fill and Sign' }).first();
    await workflowTabs.waitFor({ timeout: 15000 });
    const signButton = workflowTabs.getByRole('button', { name: 'Sign', exact: true });
    const fillAndSignButton = workflowTabs.getByRole('button', { name: 'Fill and Sign', exact: true });
    const signClass = await signButton.getAttribute('class');
    const fillAndSignClass = await fillAndSignButton.getAttribute('class');
    if (!signClass?.includes('ui-button--primary')) {
      throw new Error(`Expected Sign to be the default workflow mode, got class=${signClass}`);
    }
    if (fillAndSignClass?.includes('ui-button--primary')) {
      throw new Error(`Expected Fill and Sign to be inactive by default, got class=${fillAndSignClass}`);
    }

    const signatureModeSelect = page.locator('select[name="signature_mode"]');
    await signatureModeSelect.waitFor({ timeout: 10000 });
    const signatureModeValue = await signatureModeSelect.inputValue();
    if (signatureModeValue !== 'business') {
      throw new Error(`Expected signature_mode=business by default, got ${signatureModeValue}`);
    }

    // ---------------------------------------------------------------
    // Step 6: Add 2 recipients
    // ---------------------------------------------------------------
    logStep('adding 2 recipients');
    await page.locator('label:has-text("Signer name") input').fill('Alice First');
    await page.locator('label:has-text("Signer email") input').fill('alice-test@example.com');
    await page.getByRole('button', { name: 'Add recipient' }).click();
    await page.locator('.signature-request-dialog__recipient-card').filter({ hasText: 'alice-test@example.com' }).first().waitFor({ timeout: 5000 });

    await page.locator('label:has-text("Signer name") input').fill('Bob Second');
    await page.locator('label:has-text("Signer email") input').fill('bob-test@example.com');
    await page.getByRole('button', { name: 'Add recipient' }).click();
    await page.locator('.signature-request-dialog__recipient-card').filter({ hasText: 'bob-test@example.com' }).first().waitFor({ timeout: 5000 });

    const recipientCards = page.locator('.signature-request-dialog__recipient-card');
    const recipientCount = await recipientCards.count();
    if (recipientCount !== 2) {
      throw new Error(`Expected 2 queued recipient cards, found ${recipientCount}`);
    }
    logStep(`verified ${recipientCount} queued recipients`);

    // ---------------------------------------------------------------
    // Step 7: Confirm e-sign eligibility and save the real draft batch
    // ---------------------------------------------------------------
    logStep('confirming e-sign eligibility');
    await page.getByRole('checkbox', {
      name: /I reviewed the blocked-category list.*confirm this document is eligible/i,
    }).check();

    logStep('saving signing request drafts');
    // Wait for save button to be enabled
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => /Save Signing Draft/i.test(b.textContent || ''));
      return btn instanceof HTMLButtonElement && !btn.disabled;
    }, { timeout: 15000 });

    const createRequestResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/signing/requests')
        && !response.url().includes('/send')
        && response.request().method() === 'POST'
        && response.status() === 201;
    }, { timeout: 30000 });

    // Click save
    const saveButton = page.locator('button').filter({ hasText: /Save Signing Draft/i }).first();
    await saveButton.click();
    await createRequestResponse;
    await page.getByText(/Saved 2 signing drafts\./i).waitFor({ timeout: 15000 });
    await waitForCaptureCount('create responses', () => captured.createResponses.length, 2);

    logStep('signing drafts created successfully');
    await page.getByRole('heading', { name: 'Batch review and send' }).waitFor({ timeout: 10000 });

    await page.screenshot({
      path: path.join(artifactDir, 'envelope-real-flow-draft.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // Step 8: Send the saved requests
    // ---------------------------------------------------------------
    logStep('sending the signing requests');

    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const btn = buttons.find((b) => b.textContent?.trim() === 'Review and Send');
      return btn instanceof HTMLButtonElement && !btn.disabled;
    }, { timeout: 15000 });

    const sendRequestResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/signing/requests/')
        && response.url().includes('/send')
        && response.request().method() === 'POST'
        && response.ok();
    }, { timeout: 30000 });

    await page.getByRole('button', { name: 'Review and Send' }).evaluate((btn) => {
      if (btn instanceof HTMLButtonElement) btn.click();
    });
    await sendRequestResponse;
    await page.getByText(/Sent 2 signing requests\./i).waitFor({ timeout: 20000 });
    await waitForCaptureCount('send responses', () => captured.sendResponses.length, 2);

    logStep('signing requests sent successfully');

    await page.screenshot({
      path: path.join(artifactDir, 'envelope-real-flow-sent.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // Step 9: Verify captured data
    // ---------------------------------------------------------------
    logStep('verifying captured API data');

    const createPayloads = captured.createPayloads;
    const createResults = captured.createResponses;
    const sendResults = captured.sendResponses;

    const errors = [];

    if (createPayloads.length !== 2) {
      errors.push(`Expected 2 create payloads, got ${createPayloads.length}`);
    }
    if (createResults.length !== 2) {
      errors.push(`Expected 2 create responses, got ${createResults.length}`);
    }
    if (sendResults.length !== 2) {
      errors.push(`Expected 2 send responses, got ${sendResults.length}`);
    }

    const expectedEmails = ['alice-test@example.com', 'bob-test@example.com'];
    const expectedNames = ['Alice First', 'Bob Second'];

    if (createPayloads.length === 2) {
      const createdEmails = createPayloads.map((payload) => payload.signerEmail).sort();
      if (JSON.stringify(createdEmails) !== JSON.stringify(expectedEmails)) {
        errors.push(`Create payload emails mismatch: ${JSON.stringify(createdEmails)}`);
      }
      createPayloads.forEach((payload, index) => {
        if (payload.mode !== 'sign') {
          errors.push(`Create payload ${index + 1} expected mode=sign, got ${payload.mode}`);
        }
        if (payload.signatureMode !== 'business') {
          errors.push(`Create payload ${index + 1} expected signatureMode=business, got ${payload.signatureMode}`);
        }
        if (payload.esignEligibilityConfirmed !== true) {
          errors.push(`Create payload ${index + 1} missing e-sign eligibility confirmation`);
        }
        if (!payload.sourcePdfSha256) {
          errors.push(`Create payload ${index + 1} missing sourcePdfSha256`);
        }
        if (!Array.isArray(payload.anchors) || payload.anchors.length < 2) {
          errors.push(`Create payload ${index + 1} expected at least 2 anchors, got ${payload.anchors?.length}`);
        }
        const signatureAnchors = (payload.anchors || []).filter((anchor) => anchor.kind === 'signature');
        if (signatureAnchors.length < 2) {
          errors.push(`Create payload ${index + 1} expected at least 2 signature anchors, got ${signatureAnchors.length}`);
        }
      });
    }

    if (createResults.length === 2) {
      const responseEmails = createResults.map((entry) => entry.signerEmail).sort();
      if (JSON.stringify(responseEmails) !== JSON.stringify(expectedEmails)) {
        errors.push(`Create response emails mismatch: ${JSON.stringify(responseEmails)}`);
      }
      createResults.forEach((entry, index) => {
        if (!entry.id) {
          errors.push(`Create response ${index + 1} missing request id`);
        }
        if (entry.status !== 'draft') {
          errors.push(`Create response ${index + 1} expected status=draft, got ${entry.status}`);
        }
        if (entry.signatureMode !== 'business') {
          errors.push(`Create response ${index + 1} expected signatureMode=business, got ${entry.signatureMode}`);
        }
        if (!entry.sourcePdfSha256) {
          errors.push(`Create response ${index + 1} missing sourcePdfSha256`);
        }
        if (!Array.isArray(entry.anchors) || entry.anchors.length < 2) {
          errors.push(`Create response ${index + 1} expected at least 2 anchors, got ${entry.anchors?.length}`);
        }
      });
    }

    if (sendResults.length === 2) {
      const sentEmails = sendResults.map((entry) => entry.signerEmail).sort();
      if (JSON.stringify(sentEmails) !== JSON.stringify(expectedEmails)) {
        errors.push(`Send response emails mismatch: ${JSON.stringify(sentEmails)}`);
      }
      sendResults.forEach((entry, index) => {
        if (entry.status !== 'sent') {
          errors.push(`Send response ${index + 1} expected status=sent, got ${entry.status}`);
        }
        if (!entry.sentAt) {
          errors.push(`Send response ${index + 1} missing sentAt`);
        }
        if (!entry.publicToken) {
          errors.push(`Send response ${index + 1} missing publicToken`);
        }
      });
    }

    if (errors.length > 0) {
      console.error('[envelope-real-flow] VERIFICATION ERRORS:');
      errors.forEach((e) => console.error(`  - ${e}`));
      throw new Error(`Verification failed with ${errors.length} error(s):\n${errors.join('\n')}`);
    }

    logStep('ALL VERIFICATIONS PASSED');

    const summary = {
      ok: true,
      uid: userFixture.uid,
      email: userFixture.email,
      requestIds: createResults.map((entry) => entry.id),
      requestCount: createResults.length,
      signatureMode: createPayloads[0]?.signatureMode || null,
      workflowMode: createPayloads[0]?.mode || null,
      recipientNames: expectedNames,
      recipientEmails: expectedEmails,
      anchorCount: createPayloads[0]?.anchors?.length || 0,
      sentStatuses: sendResults.map((entry) => entry.status),
    };
    fs.writeFileSync(
      path.join(artifactDir, 'envelope-real-flow.json'),
      JSON.stringify(summary, null, 2),
    );
    console.log(JSON.stringify(summary));

  } finally {
    try {
      await signOutHarness(page);
    } catch {}
    if (userFixture) {
      try {
        await deleteCurrentUserHarness(page);
      } catch {
        try {
          await deleteUserByInitialToken(page, userFixture.apiKey, userFixture.initialIdToken);
        } catch {}
      }
    }
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
