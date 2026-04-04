import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  createCustomToken,
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
  'samples/fieldDetecting/pdfs/native/intake/new_patient_intake_form_fillable_badc6aa21d.pdf',
);
const samplePdfBytes = fs.readFileSync(samplePdfPath);

function logStep(message) {
  console.log(`[signing-envelope-smoke] ${message}`);
}

function assertExists(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required file: ${filePath}`);
  }
}

function makeProfile(email) {
  return {
    email,
    displayName: 'Signing Envelope Smoke Owner',
    role: 'pro',
    billing: {
      enabled: true,
      plans: {},
      hasSubscription: true,
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: false,
    },
    limits: {
      detectMaxPages: 100,
      fillableMaxPages: 1000,
      savedFormsMax: 20,
      fillLinkResponsesMonthlyMax: 10000,
      signingRequestsMonthlyMax: 10000,
    },
  };
}

function buildSigningOptions() {
  return {
    modes: [
      { key: 'sign', label: 'Sign' },
      { key: 'fill_and_sign', label: 'Fill and Sign' },
    ],
    signatureModes: [
      { key: 'business', label: 'Business' },
      { key: 'consumer', label: 'Consumer' },
    ],
    categories: [
      {
        key: 'ordinary_business_form',
        label: 'Ordinary business form',
        blocked: false,
      },
      {
        key: 'court_document',
        label: 'Court document',
        blocked: true,
        reason: 'Court notices and court documents stay outside the DullyPDF e-sign workflow.',
      },
    ],
  };
}

function buildSigningRequestFromEnvelope(recipient, index, envelopeId, payload, overrides = {}) {
  return {
    id: overrides.id || `env-req-${index}`,
    title: payload.title ? `${payload.title} \u00b7 ${recipient.name}` : `Signing Request \u00b7 ${recipient.name}`,
    mode: payload.mode || 'sign',
    signatureMode: payload.signatureMode || 'business',
    sourceType: payload.sourceType || 'workspace',
    sourceId: payload.sourceId || null,
    sourceLinkId: payload.sourceLinkId || null,
    sourceRecordLabel: payload.sourceRecordLabel || null,
    sourceDocumentName: payload.sourceDocumentName || 'Signing Smoke.pdf',
    sourceTemplateId: payload.sourceTemplateId || null,
    sourceTemplateName: payload.sourceTemplateName || payload.sourceDocumentName || 'Signing Smoke.pdf',
    sourcePdfSha256: payload.sourcePdfSha256 || null,
    sourcePdfPath: overrides.sourcePdfPath || null,
    sourceVersion: overrides.sourceVersion || `workspace:${payload.sourcePdfSha256 || 'pending'}`,
    documentCategory: payload.documentCategory || 'ordinary_business_form',
    documentCategoryLabel: 'Ordinary business form',
    manualFallbackEnabled: payload.manualFallbackEnabled !== false,
    signerName: recipient.name,
    signerEmail: recipient.email,
    status: overrides.status || 'draft',
    anchors: Array.isArray(payload.anchors) ? payload.anchors : [],
    disclosureVersion: 'us-esign-business-v1',
    publicToken: overrides.publicToken || `env-public-token-${index}`,
    publicPath: overrides.publicPath || `/sign/env-public-token-${index}`,
    createdAt: overrides.createdAt || '2026-03-24T15:00:00Z',
    updatedAt: overrides.updatedAt || '2026-03-24T15:00:00Z',
    ownerReviewConfirmedAt: overrides.ownerReviewConfirmedAt || null,
    sentAt: overrides.sentAt || null,
    completedAt: null,
    retentionUntil: overrides.retentionUntil || null,
    openedAt: null,
    reviewedAt: null,
    consentedAt: null,
    signatureAdoptedAt: null,
    signatureAdoptedName: null,
    manualFallbackRequestedAt: null,
    invalidatedAt: null,
    invalidationReason: null,
    envelopeId: envelopeId,
    signerOrder: recipient.order ?? index + 1,
    turnActivatedAt: null,
    artifacts: overrides.artifacts || {
      signedPdf: { available: false, downloadPath: null },
      auditManifest: { available: false, downloadPath: null },
      auditReceipt: { available: false, downloadPath: null },
    },
  };
}

function buildEnvelopeSummary(payload, overrides = {}) {
  return {
    id: overrides.id || 'env-smoke-001',
    title: payload.title || null,
    mode: payload.mode || 'sign',
    signatureMode: payload.signatureMode || 'business',
    signingMode: payload.signingMode || 'separate',
    signerCount: (payload.recipients || []).length,
    completedSignerCount: 0,
    status: overrides.status || 'draft',
    sourceDocumentName: payload.sourceDocumentName || 'Signing Smoke.pdf',
    sourcePdfSha256: payload.sourcePdfSha256 || null,
    signedPdfSha256: null,
    createdAt: overrides.createdAt || '2026-03-24T15:00:00Z',
    updatedAt: overrides.updatedAt || '2026-03-24T15:00:00Z',
    completedAt: null,
    expiresAt: null,
  };
}

async function installEnvelopeWorkspaceApiMocks(page, email) {
  const state = {
    templateSessionId: 'template-session-envelope',
    createdEnvelope: null,
    createdRequests: [],
    envelopePayloadSeen: null,
    sendBodySeen: false,
  };

  await page.route('**/api/**', async (route, request) => {
    const url = new URL(request.url());
    const { pathname } = url;
    const method = request.method().toUpperCase();

    const json = async (status, body) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    };

    if (method === 'GET' && pathname === '/api/profile') {
      await json(200, makeProfile(email));
      return;
    }

    if (method === 'GET' && pathname === '/api/health') {
      await json(200, { ok: true, status: 'ok' });
      return;
    }

    if (method === 'GET' && pathname === '/api/saved-forms') {
      await json(200, { forms: [] });
      return;
    }

    if (method === 'GET' && pathname === '/api/groups') {
      await json(200, { groups: [] });
      return;
    }

    if (method === 'GET' && pathname === '/api/signing/options') {
      await json(200, buildSigningOptions());
      return;
    }

    if (method === 'GET' && pathname === '/api/signing/requests') {
      await json(200, {
        requests: state.createdRequests,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/templates/session') {
      await json(200, {
        success: true,
        sessionId: state.templateSessionId,
        fieldCount: 4,
        pageCount: 2,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/forms/materialize') {
      await route.fulfill({
        status: 200,
        contentType: 'application/pdf',
        body: samplePdfBytes,
      });
      return;
    }

    if (method === 'POST' && pathname === '/api/signing/envelopes') {
      const payload = JSON.parse(request.postData() || '{}');
      state.envelopePayloadSeen = payload;
      const envelopeId = 'env-smoke-001';
      const envelope = buildEnvelopeSummary(payload, {
        id: envelopeId,
        status: 'draft',
        createdAt: '2026-03-24T15:01:00Z',
        updatedAt: '2026-03-24T15:01:00Z',
      });
      const requests = (payload.recipients || []).map((recipient, index) =>
        buildSigningRequestFromEnvelope(recipient, index, envelopeId, payload, {
          id: `env-req-${index}`,
          status: 'draft',
          createdAt: '2026-03-24T15:01:00Z',
          updatedAt: '2026-03-24T15:01:00Z',
        }),
      );
      state.createdEnvelope = envelope;
      state.createdRequests = requests;
      await json(201, { envelope, requests });
      return;
    }

    if (method === 'POST' && pathname === '/api/signing/envelopes/env-smoke-001/send') {
      state.sendBodySeen = true;
      const isSequential = state.envelopePayloadSeen?.signingMode === 'sequential';
      const sentRequests = state.createdRequests.map((req, index) => ({
        ...req,
        status: 'sent',
        sentAt: '2026-03-24T15:02:00Z',
        updatedAt: '2026-03-24T15:02:00Z',
        retentionUntil: '2033-03-24T15:02:00Z',
        sourcePdfPath: `gs://dullypdf-signing/users/owner/signing/${req.id}/source/sample.pdf`,
        sourceVersion: `workspace:${req.sourcePdfSha256 || 'pending'}`,
        inviteDeliveryStatus: isSequential && index > 0 ? 'queued' : 'sent',
        turnActivatedAt: isSequential ? (index === 0 ? '2026-03-24T15:02:00Z' : null) : null,
      }));
      state.createdEnvelope = {
        ...state.createdEnvelope,
        status: 'sent',
        updatedAt: '2026-03-24T15:02:00Z',
      };
      state.createdRequests = sentRequests;
      await json(200, {
        envelope: state.createdEnvelope,
        requests: sentRequests,
      });
      return;
    }

    if (method === 'GET' && pathname === '/api/signing/envelopes/env-smoke-001') {
      await json(200, {
        envelope: state.createdEnvelope,
        requests: state.createdRequests,
      });
      return;
    }

    if (method === 'POST' && pathname === `/api/sessions/${encodeURIComponent(state.templateSessionId)}/touch`) {
      await json(200, { success: true, sessionId: state.templateSessionId });
      return;
    }

    console.error(`[signing-envelope-smoke] unhandled mock API request: ${method} ${pathname}`);
    await route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({
        detail: `Unhandled mock API request: ${method} ${pathname}`,
      }),
    });
  });

  return state;
}

async function main() {
  assertExists(samplePdfPath);
  fs.mkdirSync(artifactDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  page.on('pageerror', (error) => {
    console.error(`[signing-envelope-smoke][pageerror] ${error instanceof Error ? error.stack || error.message : String(error)}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      console.log(`[signing-envelope-smoke][browser:${message.type()}] ${message.text()}`);
    }
  });

  let mockState = null;
  const fixtureUid = `pw-signing-envelope-${Date.now()}`;
  const fixtureEmail = 'codex-signing-envelope@example.com';

  try {
    // ---------------------------------------------------------------
    // 1. Open frontend and install mocks
    // ---------------------------------------------------------------
    logStep('opening frontend');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    logStep('installing workspace API mocks');
    mockState = await installEnvelopeWorkspaceApiMocks(page, fixtureEmail);

    logStep('signing in with custom token');
    const customToken = createCustomToken(fixtureUid);
    await signInWithCustomTokenHarness(page, customToken);

    // ---------------------------------------------------------------
    // 2. Navigate to workspace and upload a PDF
    // ---------------------------------------------------------------
    logStep('opening workspace');
    await page.goto(`${baseUrl}/ui`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByText('Upload PDF for Field Detection').waitFor({ timeout: 30000 });

    logStep('uploading fillable PDF with signature anchors');
    await page.getByLabel('Upload Fillable PDF Template').setInputFiles(samplePdfPath);
    await page.getByRole('button', { name: 'Send PDF for Signature by email' }).waitFor({ timeout: 30000 });

    logStep('adding a signature anchor in the editor');
    await page.locator('.panel-mode-chip').filter({ hasText: 'Signature' }).first().click();
    await page.locator('[aria-label="Draw signature field"]').first().click({ position: { x: 160, y: 160 } });

    // ---------------------------------------------------------------
    // 3. Open the signing dialog
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
    await page.waitForFunction(() => {
      return document.querySelectorAll('.signature-request-dialog select option').length >= 3;
    }, { timeout: 10000 });

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-01-dialog-opened.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 4. Verify Signing Mode toggle visibility
    // ---------------------------------------------------------------
    logStep('verifying Signing Mode section is visible');
    await page.getByRole('heading', { name: 'Signing Mode' }).waitFor({ timeout: 5000 });

    const signingModeSection = page.locator('.signature-request-dialog__section').filter({
      has: page.getByRole('heading', { name: 'Signing Mode' }),
    }).first();
    const separateButton = signingModeSection.getByRole('button', { name: 'Separate' });
    const parallelButton = signingModeSection.getByRole('button', { name: 'Parallel' });
    const sequentialButton = signingModeSection.getByRole('button', { name: 'Sequential' });
    await separateButton.waitFor({ timeout: 5000 });
    await parallelButton.waitFor({ timeout: 5000 });
    await sequentialButton.waitFor({ timeout: 5000 });

    // Separate should be active by default (primary style)
    const separateClasses = await separateButton.getAttribute('class');
    if (!separateClasses || !separateClasses.includes('ui-button--primary')) {
      throw new Error(`Expected Separate button to be active by default, got classes: ${separateClasses}`);
    }
    logStep('confirmed Separate is active by default');

    // ---------------------------------------------------------------
    // 5. Switch to Sequential mode
    // ---------------------------------------------------------------
    logStep('switching to Sequential mode');
    await sequentialButton.click();

    const sequentialClasses = await sequentialButton.getAttribute('class');
    if (!sequentialClasses || !sequentialClasses.includes('ui-button--primary')) {
      throw new Error(`Expected Sequential button to be active after click, got classes: ${sequentialClasses}`);
    }
    const separateClassesAfter = await separateButton.getAttribute('class');
    if (!separateClassesAfter || !separateClassesAfter.includes('ui-button--ghost')) {
      throw new Error(`Expected Separate button to be ghost after switching, got classes: ${separateClassesAfter}`);
    }
    logStep('confirmed Sequential is now active, Separate is ghost');

    // Verify descriptive text updated
    await page.getByText('Signers share one document and go in listed order. Each is notified after the previous one completes.').waitFor({ timeout: 5000 });

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-02-sequential-selected.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 6. Add multiple recipients
    // ---------------------------------------------------------------
    logStep('adding recipient 1: Alice Signer');
    await page.locator('label:has-text("Signer name") input').fill('Alice Signer');
    await page.locator('label:has-text("Signer email") input').fill('alice@example.com');
    await page.getByRole('button', { name: 'Add recipient' }).click();

    logStep('adding recipient 2: Bob Reviewer');
    await page.locator('label:has-text("Signer name") input').fill('Bob Reviewer');
    await page.locator('label:has-text("Signer email") input').fill('bob@example.com');
    await page.getByRole('button', { name: 'Add recipient' }).click();

    logStep('adding recipient 3: Carol Approver');
    await page.locator('label:has-text("Signer name") input').fill('Carol Approver');
    await page.locator('label:has-text("Signer email") input').fill('carol@example.com');
    await page.getByRole('button', { name: 'Add recipient' }).click();

    // Verify all three recipients appear in the recipient list, not just in anchor assignment controls.
    await page.locator('.signature-request-dialog__recipient-card').filter({ hasText: 'alice@example.com' }).first().waitFor({ timeout: 5000 });
    await page.locator('.signature-request-dialog__recipient-card').filter({ hasText: 'bob@example.com' }).first().waitFor({ timeout: 5000 });
    await page.locator('.signature-request-dialog__recipient-card').filter({ hasText: 'carol@example.com' }).first().waitFor({ timeout: 5000 });

    // Verify the "3 queued" count in the hero bar
    const recipientMetric = page.locator('.signature-request-dialog__metric').filter({ hasText: 'Recipients' });
    const recipientCount = await recipientMetric.locator('strong').textContent();
    if (recipientCount?.trim() !== '3') {
      throw new Error(`Expected Recipients metric to show 3, got: ${recipientCount}`);
    }
    logStep('confirmed 3 recipients queued');

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-03-recipients-added.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 7. Verify sequential mode shows order numbers
    // ---------------------------------------------------------------
    logStep('verifying sequential order numbers on recipient cards');
    const orderBadges = page.locator('.signature-request-dialog__recipient-order');
    const orderBadgeCount = await orderBadges.count();
    if (orderBadgeCount !== 3) {
      throw new Error(`Expected 3 sequential order badges, found ${orderBadgeCount}`);
    }
    const firstOrder = await orderBadges.nth(0).textContent();
    const secondOrder = await orderBadges.nth(1).textContent();
    const thirdOrder = await orderBadges.nth(2).textContent();
    if (firstOrder?.trim() !== '1' || secondOrder?.trim() !== '2' || thirdOrder?.trim() !== '3') {
      throw new Error(`Expected order badges 1, 2, 3 but got: ${firstOrder}, ${secondOrder}, ${thirdOrder}`);
    }
    logStep('confirmed sequential order numbers 1, 2, 3');

    // Verify reorder buttons are present in sequential mode
    const moveUpButtons = page.locator('[aria-label="Move up"]');
    const moveDownButtons = page.locator('[aria-label="Move down"]');
    const moveUpCount = await moveUpButtons.count();
    const moveDownCount = await moveDownButtons.count();
    if (moveUpCount !== 3 || moveDownCount !== 3) {
      throw new Error(`Expected 3 move-up and 3 move-down buttons, got ${moveUpCount} up and ${moveDownCount} down`);
    }
    logStep('confirmed reorder buttons present for all recipients');

    // Verify the hero bar shows "Sequential" signing mode
    const signingModeMetric = page.locator('.signature-request-dialog__metric').filter({ hasText: 'Signing mode' });
    const signingModeValue = await signingModeMetric.locator('strong').textContent();
    if (signingModeValue?.trim() !== 'Sequential') {
      throw new Error(`Expected Signing mode metric to show Sequential, got: ${signingModeValue}`);
    }
    logStep('confirmed hero bar shows Sequential signing mode');

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-04-sequential-order-numbers.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 8. Check the eligibility attestation checkbox
    // ---------------------------------------------------------------
    logStep('checking e-sign eligibility attestation');
    await page.getByRole('checkbox', {
      name: /I reviewed the blocked-category list.*confirm this document is eligible/i,
    }).check();

    // ---------------------------------------------------------------
    // 9. Save the signing envelope draft
    // ---------------------------------------------------------------
    logStep('waiting for Save Signing Drafts button to be enabled');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const saveButton = buttons.find((button) => button.textContent?.trim() === 'Save Signing Drafts');
      return saveButton instanceof HTMLButtonElement && !saveButton.disabled;
    }, { timeout: 15000 });

    logStep('clicking Save Signing Drafts');
    const createEnvelopeResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/signing/envelopes')
        && response.request().method() === 'POST'
        && !response.url().includes('/send')
        && (response.status() === 200 || response.status() === 201);
    }, { timeout: 15000 });
    await page.getByRole('button', { name: 'Save Signing Drafts' }).click();
    await createEnvelopeResponse;

    logStep('verifying envelope draft created');
    await page.getByText(/Saved signing envelope with 3 signers\./i).waitFor({ timeout: 10000 });
    await page.getByRole('heading', { name: 'Batch review and send' }).waitFor({ timeout: 10000 });

    // Verify the POST payload had the correct shape
    if (!mockState.envelopePayloadSeen) {
      throw new Error('POST /api/signing/envelopes was not called');
    }
    const envPayload = mockState.envelopePayloadSeen;
    if (envPayload.signingMode !== 'sequential') {
      throw new Error(`Expected signingMode "sequential" in payload, got: ${envPayload.signingMode}`);
    }
    if (!Array.isArray(envPayload.recipients) || envPayload.recipients.length !== 3) {
      throw new Error(`Expected 3 recipients in payload, got: ${JSON.stringify(envPayload.recipients)}`);
    }
    const recipientEmails = envPayload.recipients.map((r) => r.email);
    if (!recipientEmails.includes('alice@example.com') || !recipientEmails.includes('bob@example.com') || !recipientEmails.includes('carol@example.com')) {
      throw new Error(`Expected all 3 recipient emails in payload, got: ${JSON.stringify(recipientEmails)}`);
    }
    // Check that order numbers are present
    for (const recipient of envPayload.recipients) {
      if (typeof recipient.order !== 'number') {
        throw new Error(`Expected numeric order for recipient ${recipient.email}, got: ${recipient.order}`);
      }
    }
    logStep('confirmed envelope payload has correct recipients and signingMode');

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-05-drafts-saved.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 10. Send the envelope
    // ---------------------------------------------------------------
    logStep('waiting for Review and Send button to be enabled');
    await page.waitForFunction(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const sendButton = buttons.find((button) => button.textContent?.trim() === 'Review and Send');
      return sendButton instanceof HTMLButtonElement && !sendButton.disabled;
    }, { timeout: 15000 });

    logStep('clicking Review and Send');
    const sendEnvelopeResponse = page.waitForResponse((response) => {
      return response.url().includes('/api/signing/envelopes/env-smoke-001/send')
        && response.request().method() === 'POST'
        && response.ok();
    }, { timeout: 15000 });
    await page.getByRole('button', { name: 'Review and Send' }).evaluate((button) => {
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error('Review and Send control is not a button element.');
      }
      button.click();
    });
    await sendEnvelopeResponse;

    logStep('verifying envelope sent');
    await page.getByText(/Sent 3 signing requests\./i).waitFor({ timeout: 10000 });

    if (!mockState.sendBodySeen) {
      throw new Error('POST /api/signing/envelopes/{id}/send was not called');
    }
    logStep('confirmed send endpoint was called');

    await page.screenshot({
      path: path.join(artifactDir, 'signing-envelope-06-sent.png'),
      fullPage: true,
    });

    // ---------------------------------------------------------------
    // 11. Write summary
    // ---------------------------------------------------------------
    const summaryPath = path.join(artifactDir, 'signing-envelope-smoke.json');
    const summary = {
      ok: true,
      screenshotDir: artifactDir,
      summaryPath,
      envelopeId: mockState.createdEnvelope?.id || null,
      signingMode: mockState.envelopePayloadSeen?.signingMode || null,
      recipientCount: mockState.createdRequests.length,
      recipientEmails: mockState.createdRequests.map((r) => r.signerEmail),
      sendBodySeen: Boolean(mockState.sendBodySeen),
      allSent: mockState.createdRequests.every((r) => r.status === 'sent'),
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
    logStep('smoke test passed');
  } finally {
    try {
      await signOutHarness(page);
    } catch {}
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
