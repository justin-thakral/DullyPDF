#!/usr/bin/env node
/**
 * Minimal detection-routing probe.
 * Signs in on the deployed dev frontend, uploads a quickTestFiles PDF, and
 * captures every network request made during the detection flow so we can
 * pinpoint where the request lands.
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
// Use a PDF with NO AcroForm fields so the frontend actually hits the
// detection path instead of short-circuiting on the fillable-upload route.
const PDF_PATH = process.env.SAMPLE_PDF
  || '/home/dully/projects/DullyPDF/quickTestFiles/new_patient_forms_1915ccb015.pdf';
const EMAIL = process.env.SMOKE_LOGIN_EMAIL;
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD;

function log(msg) {
  console.log(`[detection-probe] ${msg}`);
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    throw new Error('SMOKE_LOGIN_EMAIL and SMOKE_LOGIN_PASSWORD required');
  }
  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`Missing sample PDF: ${PDF_PATH}`);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const netEvents = [];

  // Resolve the runtime API base the bundle is actually using so we can
  // tell when Vite's proxy target diverges from what the client fetches.
  await page.addInitScript(() => {
    window.__DETECTION_DIAG__ = {};
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input?.url;
      if (url && (/detect|\/api\//i.test(url))) {
        window.__DETECTION_DIAG__.lastFetch = {
          url,
          method: (init?.method || 'GET'),
          time: Date.now(),
        };
      }
      return originalFetch(input, init);
    };
  });

  // Capture everything so we can see where detection went.
  page.on('request', (req) => {
    netEvents.push({ ts: Date.now(), kind: 'request', method: req.method(), url: req.url() });
  });
  page.on('response', (res) => {
    netEvents.push({
      ts: Date.now(),
      kind: 'response',
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
    });
  });
  page.on('requestfailed', (req) => {
    netEvents.push({
      ts: Date.now(),
      kind: 'requestfailed',
      method: req.method(),
      url: req.url(),
      failure: req.failure()?.errorText,
    });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      netEvents.push({ ts: Date.now(), kind: 'console', level: msg.type(), text: msg.text() });
    }
  });

  try {
    log(`opening ${BASE_URL}`);
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    const signInButton = page.getByRole('button', { name: 'Sign in', exact: true });
    const openProfileButton = page.getByTitle('Open profile');
    await Promise.race([
      signInButton.waitFor({ timeout: 60000 }),
      openProfileButton.waitFor({ timeout: 60000 }),
    ]);
    if (await signInButton.isVisible().catch(() => false)) {
      log('signing in');
      await signInButton.click();
      await page.getByRole('heading', { name: 'Sign in to DullyPDF' }).waitFor({ timeout: 30000 });
      const signInResp = page.waitForResponse(
        (r) =>
          r.request().method() === 'POST'
          && r.url().includes('identitytoolkit.googleapis.com')
          && r.url().includes('accounts:signInWithPassword'),
        { timeout: 60000 },
      );
      await page.getByLabel('Email').fill(EMAIL);
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      const resp = await signInResp;
      if (!resp.ok()) {
        throw new Error(`Sign-in ${resp.status()}: ${await resp.text()}`);
      }
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
    }

    // Enter workspace through the homepage "Detect Fields" CTA, then upload
    log('navigating to upload view');
    const tryNow = page.getByRole('button', { name: /Detect Fields.*Workspace|Detect Fields/i }).first();
    await tryNow.waitFor({ timeout: 30000 }).catch(() => {});
    if (await tryNow.isVisible().catch(() => false)) {
      await tryNow.click();
    }
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/detection-probe-before.png', fullPage: true }).catch(() => {});
    const inputSummary = await page.$$eval('input[type="file"]', (els) =>
      els.map((el) => ({
        id: el.id,
        name: el.name,
        accept: el.getAttribute('accept'),
        ariaLabel: el.getAttribute('aria-label'),
        visible: !(el.getAttribute('style') || '').includes('display: none'),
      })),
    );
    console.log('[detection-probe] file inputs on page:', JSON.stringify(inputSummary, null, 2));

    // Target the "Detect" (non-fillable) upload specifically. The hidden
    // input has aria-label="Upload PDF for Field Detection".
    let uploadInput = page.getByLabel(/Upload PDF for Field Detection/i).first();
    if (!(await uploadInput.count())) {
      uploadInput = page.locator('input[type="file"][accept*="pdf"]').first();
    }
    await uploadInput.waitFor({ state: 'attached', timeout: 30000 });
    log(`uploading ${PDF_PATH}`);
    await uploadInput.setInputFiles(PDF_PATH);

    log('waiting for pipeline confirm dialog');
    const continueButton = page.getByRole('button', { name: /^Continue$/ });
    await continueButton.waitFor({ timeout: 15000 }).catch(() => {});
    if (await continueButton.isVisible().catch(() => false)) {
      log('clicking Continue to trigger detection');
      await page.screenshot({ path: '/tmp/detection-probe-dialog.png', fullPage: true }).catch(() => {});
      await continueButton.click();
    } else {
      log('no Continue button appeared (dialog may have been auto-dismissed)');
    }

    log('watching network for 60s after Continue click');
    await page.waitForTimeout(60000);
    await page.screenshot({ path: '/tmp/detection-probe-after.png', fullPage: true }).catch(() => {});
    const diag = await page.evaluate(() => ({
      detectionApiBase:
        (globalThis.import?.meta?.env && import.meta.env.VITE_API_URL)
        || null,
      lastDetectFetch: window.__DETECTION_DIAG__?.lastFetch ?? null,
      processingBannerText: document.body.innerText.match(/detect|process|fetch|fail/i)?.[0] || null,
    }));
    console.log('[detection-probe] runtime diag:', JSON.stringify(diag, null, 2));
  } catch (err) {
    console.error('[detection-probe] error:', err instanceof Error ? err.message : String(err));
  } finally {
    // Narrow to the interesting bits before printing.
    const interesting = netEvents.filter((e) =>
      e.kind === 'console'
      || (e.url && (/detect|detection|commonforms|cloudtasks|session|api\/|googleapis/i.test(e.url))),
    );
    console.log('\n--- interesting events ---');
    for (const e of interesting) {
      console.log(JSON.stringify(e));
    }
    console.log('\n--- full count:', netEvents.length, 'interesting:', interesting.length, '---');
    await page.close();
    await context.close();
    await browser.close();
  }
}

main();
