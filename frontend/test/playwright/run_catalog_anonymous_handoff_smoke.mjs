import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  cleanupFixture,
  createCustomToken,
  createHybridEmailUser,
  deleteUserByInitialToken,
  signInWithCustomTokenHarness,
} from './helpers/downgradeFixture.mjs';

const repoRoot = process.cwd();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
const artifactDir = path.resolve(repoRoot, 'output/playwright');
const summaryPath = path.join(artifactDir, 'catalog-anonymous-handoff-smoke.json');
const signedOutScreenshotPath = path.join(artifactDir, 'catalog-anonymous-editor.png');
const gateScreenshotPath = path.join(artifactDir, 'catalog-download-gate.png');
const resumeScreenshotPath = path.join(artifactDir, 'catalog-auth-resume.png');
const onboardingScreenshotPath = path.join(artifactDir, 'catalog-onboarding-trial.png');

const CATALOG_SLUG = 'w-9';
const FIRST_TEXT_FIELD = 'topmostSubform[0].Page1[0].f1_01[0]';
const SECOND_TEXT_FIELD = 'topmostSubform[0].Page1[0].f1_02[0]';
const FIRST_CHECKBOX_FIELD = 'topmostSubform[0].Page1[0].Boxes3a-b_ReadOrder[0].c1_1[0]';
const FILLED_VALUE = 'Alice Catalog Smoke';
const DRAFT_STORAGE_KEY = 'dullypdf.catalogDraftState';
const ONBOARDING_PENDING_KEY = 'dullypdf.onboardingPending';

function logStep(message) {
  console.log(`[catalog-anonymous-handoff-smoke] ${message}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isFirebaseReferrerBlocked(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('API_KEY_HTTP_REFERRER_BLOCKED')
    || message.includes('requests-from-referer');
}

function sleep(durationMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs);
  });
}

async function cleanupUser(page, user) {
  if (!user) return;
  try {
    cleanupFixture(user.uid);
  } catch (error) {
    console.warn(`[catalog-anonymous-handoff-smoke] Firebase fixture cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    await deleteUserByInitialToken(page, user.apiKey, user.initialIdToken);
  } catch (error) {
    console.warn(`[catalog-anonymous-handoff-smoke] Firebase Auth cleanup warning: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function openCatalogEditor(page) {
  await page.goto(`${baseUrl}/forms/${CATALOG_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.getByRole('button', { name: /Open in the DullyPDF Workspace/i }).click();
  await page.waitForFunction(() => window.location.pathname === '/ui', { timeout: 60000 });
  await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 60000 });
  await page.locator('button').filter({ hasText: FIRST_TEXT_FIELD }).first().waitFor({ timeout: 60000 });
}

async function getBodyText(page) {
  return page.locator('body').innerText({ timeout: 30000 });
}

async function waitForLoginShell(page) {
  await page.waitForFunction(() => document.body.innerText.includes('Sign in to DullyPDF'), { timeout: 30000 });
}

async function getFieldNames(page) {
  return page.locator('.field-list .field-row__name').evaluateAll((nodes) => {
    return nodes
      .map((node) => node.textContent?.trim() || '')
      .filter(Boolean);
  });
}

async function setColorInput(page, selector, value) {
  await page.locator(selector).fill(value);
}

async function applyCatalogEdits(page) {
  await page.getByRole('button', { name: /^Fill$/ }).click();
  await page.locator(`input[aria-label="${FIRST_TEXT_FIELD}"]`).fill(FILLED_VALUE);
  await page.locator(`input[aria-label="${FIRST_CHECKBOX_FIELD}"]`).check();

  await page.selectOption('#global-field-font', 'Times-Roman');
  await page.selectOption('#global-field-font-size', 'custom');
  await page.locator('#global-field-font-size-custom').fill('14');
  await setColorInput(page, '#global-field-font-color', '#123abc');
  await page.selectOption('#global-field-alignment', 'right');

  await page.locator('button').filter({ hasText: SECOND_TEXT_FIELD }).first().click();
  await page.getByRole('button', { name: /^Delete field$/ }).click();
  await page.waitForFunction((deletedFieldName) => {
    return Array.from(document.querySelectorAll('.field-list .field-row__name'))
      .every((node) => node.textContent?.trim() !== deletedFieldName);
  }, SECOND_TEXT_FIELD, { timeout: 30000 });
}

async function clickDownloadFlat(page) {
  await page.getByRole('button', { name: /^Download/ }).first().click();
  await page.locator('button').filter({ hasText: 'Download flat PDF' }).click();
}

async function readCatalogDraft(page) {
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), DRAFT_STORAGE_KEY);
  assert(raw, 'Expected catalog draft state in sessionStorage.');
  return JSON.parse(raw);
}

function assertDraftContainsEdits(draft, expectedPendingAction) {
  assert(draft.slug === CATALOG_SLUG, `Expected draft slug ${CATALOG_SLUG}, received ${draft.slug}.`);
  assert(draft.pendingAction?.type === expectedPendingAction, `Expected pending action ${expectedPendingAction}, received ${JSON.stringify(draft.pendingAction)}.`);
  assert(Array.isArray(draft.fields), 'Expected draft fields array.');
  assert(draft.fields.length === 22, `Expected 22 fields after one deletion, received ${draft.fields.length}.`);
  assert(!draft.fields.some((field) => field?.name === SECOND_TEXT_FIELD), 'Deleted field was still present in the draft.');
  assert(draft.fields.some((field) => field?.name === FIRST_TEXT_FIELD && field?.value === FILLED_VALUE), 'Filled text value was not present in the draft.');
  assert(draft.fields.some((field) => field?.name === FIRST_CHECKBOX_FIELD && field?.value === true), 'Checked checkbox value was not present in the draft.');
  assert(draft.globalFieldFont === 'Times-Roman', `Expected draft global font Times-Roman, received ${draft.globalFieldFont}.`);
  assert(draft.globalFieldFontSize === 14, `Expected draft global font size 14, received ${draft.globalFieldFontSize}.`);
  assert(String(draft.globalFieldFontColor || '').toLowerCase() === '#123abc', `Expected draft global font color #123abc, received ${draft.globalFieldFontColor}.`);
  assert(draft.globalFieldAlignment === 'right', `Expected draft global alignment right, received ${draft.globalFieldAlignment}.`);
}

async function assertSignedOutCatalogEditor(page) {
  const body = await getBodyText(page);
  assert(body.includes('Form Field Editor'), 'Expected editor heading in anonymous catalog workspace.');
  assert(!body.includes('Sign in to DullyPDF'), 'Anonymous catalog handoff opened the login shell instead of the editor.');
  assert(body.includes('Sign in to run Map Schema.'), 'Expected schema mapping to be account-gated while signed out.');
  assert(!body.includes('PDF Tools'), 'Signed-out catalog editor exposed PDF Tools.');
  assert(!body.includes('Fill By Web Form Link + Sign'), 'Signed-out catalog editor exposed Fill By Link/signing.');
  assert(!body.includes('API Fill'), 'Signed-out catalog editor exposed API Fill.');
  assert(!body.includes('Sign out'), 'Signed-out catalog editor exposed signed-in controls.');
}

async function assertAuthenticatedResume(page, expectedEmail) {
  await page.getByRole('button', { name: 'Save', exact: true }).waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: /^Fill$/ }).click();
  await page.locator(`input[aria-label="${FIRST_TEXT_FIELD}"]`).waitFor({ timeout: 60000 });
  await page.waitForFunction((deletedFieldName) => {
    return Array.from(document.querySelectorAll('.field-list .field-row__name'))
      .every((node) => node.textContent?.trim() !== deletedFieldName);
  }, SECOND_TEXT_FIELD, { timeout: 60000 });

  const body = await getBodyText(page);
  const fieldNames = await getFieldNames(page);
  const restoredValue = await page.locator(`input[aria-label="${FIRST_TEXT_FIELD}"]`).inputValue();
  const restoredCheckboxChecked = await page.locator(`input[aria-label="${FIRST_CHECKBOX_FIELD}"]`).isChecked();
  const restoredFont = await page.locator('#global-field-font').inputValue();
  const restoredFontSizeMode = await page.locator('#global-field-font-size').inputValue();
  const restoredFontSize = await page.locator('#global-field-font-size-custom').inputValue();
  const restoredColor = await page.locator('#global-field-font-color').inputValue();
  const restoredAlignment = await page.locator('#global-field-alignment').inputValue();

  assert(body.includes(expectedEmail), 'Authenticated editor did not show the throwaway user email.');
  assert(body.includes('Sign out'), 'Authenticated editor did not show signed-in controls.');
  assert(body.includes('PDF Tools'), 'Authenticated editor did not expose PDF Tools.');
  assert(body.includes('Fill By Web Form Link + Sign'), 'Authenticated editor did not expose Fill By Link/signing.');
  assert(body.includes('API Fill'), 'Authenticated editor did not expose API Fill.');
  assert(fieldNames.length === 22, `Expected 22 restored fields after deletion, received ${fieldNames.length}.`);
  assert(!fieldNames.includes(SECOND_TEXT_FIELD), 'Deleted field returned after login.');
  assert(restoredValue === FILLED_VALUE, `Filled text value did not survive login. Received ${restoredValue}.`);
  assert(restoredCheckboxChecked, 'Checked checkbox value did not survive login.');
  assert(restoredFont === 'Times-Roman', `Global font did not survive login. Received ${restoredFont}.`);
  assert(restoredFontSizeMode === 'custom', `Global font size mode did not survive login. Received ${restoredFontSizeMode}.`);
  assert(restoredFontSize === '14', `Global font size did not survive login. Received ${restoredFontSize}.`);
  assert(restoredColor.toLowerCase() === '#123abc', `Global font color did not survive login. Received ${restoredColor}.`);
  assert(restoredAlignment === 'right', `Global alignment did not survive login. Received ${restoredAlignment}.`);
}

async function signInWithThrowawayUser(page, user) {
  const customToken = createCustomToken(user.uid);
  await signInWithCustomTokenHarness(page, customToken);
}

async function createThrowawayUser(page) {
  const user = await createHybridEmailUser(page);
  return user;
}

async function runSignedOutGatePhase(browser, results) {
  logStep('checking signed-out catalog editor and download gate');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  try {
    await openCatalogEditor(page);
    await assertSignedOutCatalogEditor(page);
    await applyCatalogEdits(page);
    await page.screenshot({ path: signedOutScreenshotPath, fullPage: true });

    await clickDownloadFlat(page);
    await waitForLoginShell(page);
    const downloadDraft = await readCatalogDraft(page);
    assertDraftContainsEdits(downloadDraft, 'download');

    await page.getByText(/Sign up/i).click();
    await page.getByRole('heading', { name: /Create account for DullyPDF/i }).waitFor({ timeout: 30000 });
    const signupDraft = await readCatalogDraft(page);
    assertDraftContainsEdits(signupDraft, 'download');
    await page.screenshot({ path: gateScreenshotPath, fullPage: true });

    results.phases.signedOutGate = {
      ok: true,
      currentUrl: page.url(),
      fieldCount: downloadDraft.fields.length,
      pendingAction: downloadDraft.pendingAction,
      signupScreenReachable: true,
    };
  } finally {
    await context.close();
  }
}

async function runAuthenticatedResumePhase(browser, results) {
  logStep('checking verified login resume with anonymous edits intact');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  let user = null;
  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    user = await createThrowawayUser(page);
    await openCatalogEditor(page);
    await applyCatalogEdits(page);
    await clickDownloadFlat(page);
    await waitForLoginShell(page);
    try {
      await signInWithThrowawayUser(page, user);
      await assertAuthenticatedResume(page, user.email);
    } catch (error) {
      if (!isFirebaseReferrerBlocked(error)) {
        throw error;
      }
      results.phases.authenticatedResume = {
        ok: true,
        skipped: true,
        reason: 'firebase_api_key_referrer_blocked',
        currentUrl: page.url(),
        userEmail: user.email,
      };
      return;
    }
    await page.screenshot({ path: resumeScreenshotPath, fullPage: true });

    results.phases.authenticatedResume = {
      ok: true,
      currentUrl: page.url(),
      userEmail: user.email,
      fieldCount: (await getFieldNames(page)).length,
      restoredValue: await page.locator(`input[aria-label="${FIRST_TEXT_FIELD}"]`).inputValue(),
    };
  } finally {
    await cleanupUser(page, user);
    await context.close();
  }
}

async function runOnboardingTrialPhase(browser, results) {
  logStep('checking signup-pending onboarding and free-trial checkout intent');
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const checkoutRequests = [];
  let user = null;

  await page.route('**/api/billing/checkout-session', async (route) => {
    const rawPostData = route.request().postData() || '{}';
    let payload = {};
    try {
      payload = JSON.parse(rawPostData);
    } catch {
      payload = { parseError: true, rawPostData };
    }
    checkoutRequests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        kind: payload.kind || 'free_trial',
        sessionId: 'cs_test_catalog_anonymous_handoff',
        checkoutUrl: 'https://checkout.stripe.com/c/test_catalog_anonymous_handoff',
        attemptId: payload.attemptId || 'attempt_catalog_anonymous_handoff',
        checkoutPriceId: 'price_test_free_trial',
      }),
    });
  });
  await page.route('https://checkout.stripe.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Stripe checkout stub</title><h1>Stripe checkout stub</h1>',
    });
  });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    user = await createThrowawayUser(page);
    await openCatalogEditor(page);
    await applyCatalogEdits(page);
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await waitForLoginShell(page);
    const saveDraft = await readCatalogDraft(page);
    assertDraftContainsEdits(saveDraft, 'save');

    await page.evaluate(({ key, uid }) => {
      localStorage.setItem(key, JSON.stringify({ userId: uid, ts: Date.now() }));
    }, { key: ONBOARDING_PENDING_KEY, uid: user.uid });

    try {
      await signInWithThrowawayUser(page, user);
    } catch (error) {
      if (!isFirebaseReferrerBlocked(error)) {
        throw error;
      }
      results.phases.onboardingTrial = {
        ok: true,
        skipped: true,
        reason: 'firebase_api_key_referrer_blocked',
        currentUrl: page.url(),
        userEmail: user.email,
        pendingAction: saveDraft.pendingAction,
      };
      return;
    }
    await page.getByRole('heading', { name: /Welcome to DullyPDF/i }).waitFor({ timeout: 60000 });
    const onboardingDraft = await readCatalogDraft(page);
    assertDraftContainsEdits(onboardingDraft, 'save');
    await page.screenshot({ path: onboardingScreenshotPath, fullPage: true });

    await page.getByRole('button', { name: /Start 7-Day Free Trial/i }).click();
    let billingUnavailable = false;
    for (let attempt = 0; attempt < 30 && checkoutRequests.length === 0 && !billingUnavailable; attempt += 1) {
      await sleep(500);
      billingUnavailable = await page.getByText(/Stripe billing is currently unavailable/i).isVisible().catch(() => false);
    }
    let billingCheckout = 'requested';
    if (checkoutRequests.length === 0) {
      assert(billingUnavailable, 'Expected a free_trial checkout request or the local billing-unavailable guard.');
      billingCheckout = 'blocked_by_local_billing_config';
    } else {
      assert(checkoutRequests.length === 1, `Expected one checkout-session request, received ${checkoutRequests.length}.`);
      assert(checkoutRequests[0].kind === 'free_trial', `Expected free_trial checkout kind, received ${JSON.stringify(checkoutRequests[0])}.`);
    }

    results.phases.onboardingTrial = {
      ok: true,
      currentUrl: page.url(),
      userEmail: user.email,
      pendingAction: onboardingDraft.pendingAction,
      billingCheckout,
      checkoutRequest: checkoutRequests[0] ?? null,
    };
  } finally {
    await cleanupUser(page, user);
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = {
    ok: false,
    baseUrl,
    summaryPath,
    screenshots: {
      signedOut: signedOutScreenshotPath,
      gate: gateScreenshotPath,
      resume: resumeScreenshotPath,
      onboarding: onboardingScreenshotPath,
    },
    phases: {},
    pageErrors: [],
    consoleErrors: [],
  };

  try {
    await runSignedOutGatePhase(browser, results);
    await runAuthenticatedResumePhase(browser, results);
    await runOnboardingTrialPhase(browser, results);
    results.ok = true;
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
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
