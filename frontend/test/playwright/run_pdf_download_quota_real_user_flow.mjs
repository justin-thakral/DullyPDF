#!/usr/bin/env node
/**
 * PDF download quota real-user smoke.
 *
 * Uses Playwright against the local dev UI and the real dullypdf-dev Firebase
 * project. Stripe upgrade/downgrade uses the local Stripe CLI listener, so
 * webhook delivery goes through the same `/api/billing/webhook` route as a
 * real Stripe test-mode event.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import {
  createCustomToken,
  createHybridEmailUser,
  deleteCurrentUserHarness,
  deleteUserByInitialToken,
  runBackendPython,
  signInWithCustomTokenHarness,
  signOutHarness,
} from './helpers/downgradeFixture.mjs';

const repoRoot = process.cwd();
const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const artifactDir = path.resolve(repoRoot, 'output/playwright');
const screenshotPath = path.join(artifactDir, 'pdf-download-quota-real-user-flow.png');
const summaryPath = path.join(artifactDir, 'pdf-download-quota-real-user-flow.json');
const pdfBytesBase64 = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n'
  + '2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n'
  + '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 72 72]>>endobj\n'
  + 'xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n'
  + 'trailer<</Size 4/Root 1 0 R>>\nstartxref\n185\n%%EOF\n',
).toString('base64');

function logStep(message) {
  console.log(`[pdf-download-quota-real-user-flow] ${message}`);
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function retry(label, attempts, fn) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) break;
      console.warn(`[pdf-download-quota-real-user-flow] ${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(2500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function backendJson(script, extraEnv = {}) {
  const output = runBackendPython(script, extraEnv);
  return JSON.parse(output.split('\n').pop());
}

function seedQuotaFixture({ uid, email, downloadCount }) {
  return backendJson(
    `
import json
import os
from datetime import datetime, timezone

from backend.firebaseDB.firebase_service import get_firestore_client, init_firebase
from backend.firebaseDB.pdf_download_database import PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION, _usage_counter_doc_id
from backend.firebaseDB.user_database import BASE_OPENAI_CREDITS, OPENAI_CREDITS_BASE_CYCLE_FIELD, OPENAI_CREDITS_FIELD, ROLE_FIELD

uid = os.environ["PW_UID"]
email = os.environ["PW_EMAIL"]
download_count = int(os.environ["PW_DOWNLOAD_COUNT"])
month_key = datetime.now(timezone.utc).strftime("%Y-%m")

init_firebase()
client = get_firestore_client()
client.collection("app_users").document(uid).set(
    {
        "firebase_uid": uid,
        "email": email,
        "displayName": "PDF Quota Smoke User",
        ROLE_FIELD: "base",
        OPENAI_CREDITS_FIELD: BASE_OPENAI_CREDITS,
        OPENAI_CREDITS_BASE_CYCLE_FIELD: month_key,
        "created_at": "2026-05-01T00:00:00+00:00",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    },
    merge=True,
)
client.collection(PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(_usage_counter_doc_id(uid, month_key)).set(
    {
        "user_id": uid,
        "month_key": month_key,
        "download_count": download_count,
        "event_count": download_count,
        "workspace_download_count": download_count,
        "group_download_pdf_count": 0,
        "created_at": "2026-05-01T00:00:00+00:00",
        "updated_at": datetime.now(timezone.utc).isoformat(),
    },
    merge=True,
)
print(json.dumps({"uid": uid, "email": email, "monthKey": month_key, "downloadCount": download_count}, sort_keys=True))
`,
    { PW_UID: uid, PW_EMAIL: email, PW_DOWNLOAD_COUNT: String(downloadCount) },
  );
}

function readQuotaState(uid) {
  return backendJson(
    `
import json
import os
from datetime import datetime, timezone

from backend.firebaseDB.firebase_service import get_firestore_client, init_firebase
from backend.firebaseDB.pdf_download_database import PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION, _usage_counter_doc_id

uid = os.environ["PW_UID"]
month_key = datetime.now(timezone.utc).strftime("%Y-%m")
init_firebase()
client = get_firestore_client()
user_snapshot = client.collection("app_users").document(uid).get()
usage_snapshot = client.collection(PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(_usage_counter_doc_id(uid, month_key)).get()
print(json.dumps({
    "uid": uid,
    "monthKey": month_key,
    "user": user_snapshot.to_dict() or {},
    "usage": usage_snapshot.to_dict() or {},
}, sort_keys=True))
`,
    { PW_UID: uid },
  );
}

function cleanupQuotaFixture(uid) {
  runBackendPython(
    `
import os
from datetime import datetime, timezone
from google.cloud.firestore_v1.base_query import FieldFilter

from firebase_admin import auth
from backend.firebaseDB.firebase_service import get_firestore_client, init_firebase
from backend.firebaseDB.pdf_download_database import (
    PDF_DOWNLOAD_EVENTS_COLLECTION,
    PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION,
    PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION,
    _usage_counter_doc_id,
)

uid = os.environ["PW_UID"]
month_key = datetime.now(timezone.utc).strftime("%Y-%m")
init_firebase()
client = get_firestore_client()
for collection_name in (PDF_DOWNLOAD_EVENTS_COLLECTION, PDF_DOWNLOAD_REQUEST_GUARDS_COLLECTION):
    for snapshot in client.collection(collection_name).where(filter=FieldFilter("user_id", "==", uid)).get():
        snapshot.reference.delete()
client.collection(PDF_DOWNLOAD_USAGE_COUNTERS_COLLECTION).document(_usage_counter_doc_id(uid, month_key)).delete()
client.collection("app_users").document(uid).delete()
try:
    auth.delete_user(uid)
except Exception:
    pass
print("ok")
`,
    { PW_UID: uid },
  );
}

function cancelStripeSubscription(subscriptionId) {
  if (!subscriptionId) return null;
  const output = execFileSync(
    'bash',
    [
      '-lc',
      `
set -euo pipefail
set -a
source env/backend.dev.env
set +a
STRIPE_API_KEY="$STRIPE_SECRET_KEY" stripe subscriptions cancel --confirm "$PW_SUBSCRIPTION_ID"
`,
    ],
    {
      cwd: repoRoot,
      env: { ...process.env, PW_SUBSCRIPTION_ID: subscriptionId },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const jsonStart = output.indexOf('{');
  if (jsonStart < 0) {
    throw new Error(`Stripe subscription cancel did not return JSON: ${output.slice(0, 200)}`);
  }
  return JSON.parse(output.slice(jsonStart));
}

async function browserProfile(page) {
  return page.evaluate(async ({ apiBaseUrl }) => {
    const { firebaseAuth } = await import('/src/services/firebaseClient.ts');
    if (typeof firebaseAuth.authStateReady === 'function') {
      await firebaseAuth.authStateReady();
    }
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Expected authenticated user.');
    const token = await user.getIdToken(true);
    const response = await fetch(`${apiBaseUrl}/api/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    return { status: response.status, payload };
  }, { apiBaseUrl });
}

async function postPdfForm(page, { pathName, requestId, groupCount = 0, exportMode = 'editable' }) {
  return page.evaluate(async ({ apiBaseUrl, pathName, requestId, groupCount, exportMode, pdfBytesBase64 }) => {
    const { firebaseAuth } = await import('/src/services/firebaseClient.ts');
    if (typeof firebaseAuth.authStateReady === 'function') {
      await firebaseAuth.authStateReady();
    }
    const user = firebaseAuth.currentUser;
    if (!user) throw new Error('Expected authenticated user.');
    const token = await user.getIdToken(true);
    const toPdfBlob = () => {
      const binary = atob(pdfBytesBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return new Blob([bytes], { type: 'application/pdf' });
    };
    const formData = new FormData();
    if (pathName.endsWith('/group-download')) {
      const items = [];
      for (let index = 0; index < groupCount; index += 1) {
        formData.append('pdfs', toPdfBlob(), `quota-smoke-${index + 1}.pdf`);
        items.push({
          fileIndex: index,
          filename: `quota-smoke-${index + 1}.pdf`,
          fields: [],
          exportMode: 'editable',
        });
      }
      formData.append('payload', JSON.stringify({
        downloadRequestId: requestId,
        groupId: 'quota-smoke-group',
        groupName: 'Quota Smoke Group',
        items,
      }));
    } else {
      formData.append('pdf', toPdfBlob(), 'quota-smoke.pdf');
      formData.append('fields', '[]');
      formData.append('exportMode', exportMode);
      if (requestId) {
        formData.append('downloadRequestId', requestId);
      }
    }
    const response = await fetch(`${apiBaseUrl}${pathName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    const headers = Object.fromEntries(response.headers.entries());
    const contentType = response.headers.get('content-type') || '';
    let json = null;
    let byteLength = 0;
    if (contentType.includes('application/json')) {
      json = await response.json();
    } else {
      byteLength = (await response.arrayBuffer()).byteLength;
    }
    return { status: response.status, ok: response.ok, headers, json, byteLength };
  }, { apiBaseUrl, pathName, requestId, groupCount, exportMode, pdfBytesBase64 });
}

async function openProfileUi(page) {
  await page.goto(`${baseUrl}/ui/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.getByText('Account overview').waitFor({ timeout: 60000 });
  await page.getByRole('button', { name: 'Return to workspace' }).waitFor({ timeout: 60000 });
}

async function fillAnyVisible(page, selectors, value) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const contexts = [page, ...page.frames()];
    for (const context of contexts) {
      for (const selector of selectors) {
        const locator = context.locator(selector).first();
        if (await locator.isVisible().catch(() => false)) {
          await locator.fill(value);
          return true;
        }
      }
    }
    await sleep(500);
  }
  return false;
}

async function fillRequired(page, label, selectors, value) {
  const filled = await fillAnyVisible(page, selectors, value);
  if (!filled) {
    throw new Error(`Stripe Checkout ${label} field was not visible.`);
  }
}

async function selectStripeCardMethod(page) {
  const cardNumberField = page.locator('input[name="cardNumber"], input[autocomplete="cc-number"]').first();
  if (await cardNumberField.isVisible().catch(() => false)) {
    return;
  }

  const visibleCardTargets = [
    page.locator('input[name="payment-method-accordion-item-title"]').first(),
    page.getByText('Card', { exact: true }).first(),
  ];
  for (const target of visibleCardTargets) {
    try {
      if (await target.isVisible({ timeout: 1500 }).catch(() => false)) {
        await target.click({ force: true, timeout: 5000 });
        await page.waitForTimeout(800);
      }
      if (await cardNumberField.isVisible().catch(() => false)) {
        return;
      }
    } catch {}
  }

  throw new Error('Stripe Checkout Card payment method could not be selected.');
}

async function completeStripeCheckout(page, email) {
  await page.waitForURL(/checkout\.stripe\.com|billing\.stripe\.com/, { timeout: 90000 });
  await fillAnyVisible(page, ['input[name="email"]', 'input[type="email"]'], email).catch(() => {});

  await selectStripeCardMethod(page);

  await fillRequired(page, 'card number', [
    'input[name="cardNumber"]',
    'input[name="number"]',
    'input[autocomplete="cc-number"]',
    'input[aria-label*="Card number" i]',
    'input[placeholder*="1234"]',
  ], '4242424242424242');
  await fillRequired(page, 'expiry', [
    'input[name="cardExpiry"]',
    'input[name="expiry"]',
    'input[autocomplete="cc-exp"]',
    'input[aria-label*="Expiration" i]',
    'input[aria-label*="Expiry" i]',
    'input[placeholder*="MM"]',
  ], '1234');
  await fillRequired(page, 'CVC', [
    'input[name="cardCvc"]',
    'input[name="cvc"]',
    'input[autocomplete="cc-csc"]',
    'input[aria-label*="CVC" i]',
    'input[aria-label*="security code" i]',
    'input[placeholder*="CVC"]',
  ], '123');
  await fillAnyVisible(page, ['input[name="billingName"]', 'input[autocomplete="cc-name"]'], 'PDF Quota Smoke User').catch(() => {});
  await fillAnyVisible(page, ['input[name="billingPostalCode"]', 'input[autocomplete="postal-code"]'], '94103').catch(() => {});
  await fillAnyVisible(page, ['input[type="tel"]', 'input[name="phone"]', 'input[autocomplete="tel"]'], '2015550123').catch(() => {});

  const submitButton = page.locator('[data-testid="hosted-payment-submit-button"], button[type="submit"]').first();
  await submitButton.click({ timeout: 60000 });
  await page.waitForURL(/localhost:5173|127\.0\.0\.1:5173/, { timeout: 120000 });
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: process.env.PLAYWRIGHT_HEADLESS !== 'false' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const summary = {
    ok: false,
    baseUrl,
    apiBaseUrl,
    screenshotPath,
    summaryPath,
    steps: [],
  };
  let userFixture = null;
  let subscriptionId = null;

  try {
    logStep('creating Firebase smoke user');
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    userFixture = await createHybridEmailUser(page);
    summary.uid = userFixture.uid;
    summary.email = userFixture.email;

    const seeded = seedQuotaFixture({ uid: userFixture.uid, email: userFixture.email, downloadCount: 24 });
    summary.steps.push({ name: 'seeded-base-usage', seeded });

    const customToken = createCustomToken(userFixture.uid);
    await signInWithCustomTokenHarness(page, customToken);

    logStep('verifying base profile at 24/25');
    await openProfileUi(page);
    await page.getByText('24 / 25', { exact: true }).waitFor({ timeout: 60000 });
    summary.steps.push({ name: 'profile-before-download', profile: await browserProfile(page) });

    logStep('proving materialize endpoint does not charge quota');
    const materializeResult = await postPdfForm(page, { pathName: '/api/forms/materialize', requestId: null });
    if (materializeResult.status !== 200) throw new Error(`materialize failed: ${JSON.stringify(materializeResult)}`);
    const afterMaterialize = readQuotaState(userFixture.uid);
    if (afterMaterialize.usage.download_count !== 24) {
      throw new Error(`materialize charged quota unexpectedly: ${JSON.stringify(afterMaterialize.usage)}`);
    }
    summary.steps.push({ name: 'materialize-not-charged', result: materializeResult, state: afterMaterialize });

    logStep('using final free download and verifying cap block');
    const finalDownload = await postPdfForm(page, {
      pathName: '/api/forms/download',
      requestId: `pw-final-${Date.now()}`,
    });
    const afterFinalDownload = readQuotaState(userFixture.uid);
    if (finalDownload.status !== 200 || afterFinalDownload.usage.download_count !== 25) {
      throw new Error(`final free download did not succeed at cap: ${JSON.stringify(finalDownload)}`);
    }
    const blockedDownload = await postPdfForm(page, {
      pathName: '/api/forms/download',
      requestId: `pw-blocked-${Date.now()}`,
      exportMode: 'flat',
    });
    if (blockedDownload.status !== 429 || blockedDownload.json?.detail?.code !== 'pdf_download_limit_reached') {
      throw new Error(`over-limit download did not block: ${JSON.stringify(blockedDownload)}`);
    }
    summary.steps.push({ name: 'free-cap-enforced', finalDownload, blockedDownload, state: readQuotaState(userFixture.uid) });

    logStep('starting real Stripe Checkout upgrade');
    await openProfileUi(page);
    const upgradeButton = page.getByRole('button', { name: /Upgrade to Pro Monthly/i }).first();
    await upgradeButton.waitFor({ timeout: 60000 });
    await upgradeButton.click();
    await completeStripeCheckout(page, userFixture.email);
    await openProfileUi(page);

    logStep('waiting for Stripe webhook to grant Pro/unlimited');
    const upgradedProfile = await retry('profile upgraded to Pro', 30, async () => {
      const profileResult = await browserProfile(page);
      if (profileResult.payload.role !== 'pro' || profileResult.payload.pdfDownloadsRemaining !== null) {
        throw new Error(`Profile not upgraded yet: ${JSON.stringify(profileResult.payload)}`);
      }
      return profileResult;
    });
    const upgradedState = readQuotaState(userFixture.uid);
    subscriptionId = upgradedState.user.stripe_subscription_id;
    if (!subscriptionId) throw new Error(`Missing subscription id after checkout: ${JSON.stringify(upgradedState.user)}`);
    summary.steps.push({ name: 'stripe-upgrade-unlimited', profile: upgradedProfile, state: upgradedState });

    logStep('downloading over the free cap as Pro');
    const proDownload = await postPdfForm(page, {
      pathName: '/api/forms/download',
      requestId: `pw-pro-${Date.now()}`,
    });
    const afterProDownload = readQuotaState(userFixture.uid);
    if (proDownload.status !== 200 || afterProDownload.usage.download_count < 26) {
      throw new Error(`Pro over-cap download did not behave as unlimited: ${JSON.stringify(proDownload)}`);
    }
    summary.steps.push({ name: 'pro-over-cap-download', result: proDownload, state: readQuotaState(userFixture.uid) });

    logStep(`canceling Stripe subscription ${subscriptionId} to drive terminal downgrade webhook`);
    const cancelResult = cancelStripeSubscription(subscriptionId);
    summary.steps.push({ name: 'stripe-subscription-cancel-requested', cancelResult: { id: cancelResult?.id, status: cancelResult?.status } });

    const downgradedProfile = await retry('profile downgraded to base', 40, async () => {
      const profileResult = await browserProfile(page);
      if (profileResult.payload.role !== 'base' || profileResult.payload.limits?.pdfDownloadsMonthlyMax !== 25) {
        throw new Error(`Profile not downgraded yet: ${JSON.stringify(profileResult.payload)}`);
      }
      return profileResult;
    });
    summary.steps.push({ name: 'stripe-downgrade-recap', profile: downgradedProfile, state: readQuotaState(userFixture.uid) });

    const postDowngradeBlocked = await postPdfForm(page, {
      pathName: '/api/forms/download',
      requestId: `pw-downgrade-blocked-${Date.now()}`,
    });
    if (postDowngradeBlocked.status !== 429) {
      throw new Error(`Post-downgrade over-cap download should block: ${JSON.stringify(postDowngradeBlocked)}`);
    }
    summary.steps.push({ name: 'post-downgrade-cap-blocked', result: postDowngradeBlocked, state: readQuotaState(userFixture.uid) });

    await openProfileUi(page);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    summary.currentUrl = page.url();
    summary.ok = true;
  } catch (error) {
    summary.error = error instanceof Error ? error.message : String(error);
    summary.stack = error instanceof Error ? error.stack : null;
    summary.currentUrl = page.url();
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    if (subscriptionId) {
      try {
        cancelStripeSubscription(subscriptionId);
      } catch {}
    }
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
      try {
        cleanupQuotaFixture(userFixture.uid);
      } catch (error) {
        summary.cleanupError = error instanceof Error ? error.message : String(error);
      }
    }
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    await page.close();
    await browser.close();
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
