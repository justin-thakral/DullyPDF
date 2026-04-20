#!/usr/bin/env node
/**
 * Search & Fill crediting smoke.
 *
 * Logs in as a seeded user against a real backend, then drives the new
 * ``/api/search-fill/precheck`` and ``/api/search-fill/usage`` endpoints
 * directly via the in-page auth token. The point of this smoke is to prove
 * the wire is live end-to-end:
 *
 *   1. precheck returns the current monthly limit and remaining budget
 *   2. a single-template commit charges exactly 1 credit
 *   3. replaying the same ``requestId`` does not double-charge
 *   4. a no-match commit (count_increment=0) is recorded as rejected_no_match
 *   5. profile ``structuredFillCreditsThisMonth`` reflects the debit
 *
 * Keep this smoke API-only — UI flows live in the real-user flow script.
 * Running this against prod Firestore is fine for a god-role account since
 * replayed ids don't inflate totals; still, prefer a staging account.
 */

import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

import { signInFromHomepageAndOpenProfile, getCurrentAuthToken } from './helpers/workspaceFixture.mjs';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'search-fill-crediting-smoke.png');
const summaryPath = path.join(artifactDir, 'search-fill-crediting-smoke.json');
const loginEmail = (process.env.SMOKE_LOGIN_EMAIL || process.env.PLAYWRIGHT_LOGIN_EMAIL || '').trim();
const loginPassword = process.env.SMOKE_LOGIN_PASSWORD || process.env.PLAYWRIGHT_LOGIN_PASSWORD || '';

function logStep(message) {
  console.log(`[search-fill-crediting-smoke] ${message}`);
}

async function callApi(page, method, pathname, { body, expectedStatus = 200 } = {}) {
  const token = await getCurrentAuthToken(page);
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = { raw: text };
  }
  if (expectedStatus !== null && response.status !== expectedStatus) {
    throw new Error(
      `${method} ${pathname} returned ${response.status} (expected ${expectedStatus}): ${text}`,
    );
  }
  return { status: response.status, payload: parsed };
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const results = {
    ok: false,
    baseUrl,
    apiBaseUrl,
    screenshotPath,
    summaryPath,
    steps: {},
  };

  try {
    logStep(`signing in as ${loginEmail || '(missing)'} against ${baseUrl}`);
    await signInFromHomepageAndOpenProfile(page, { baseUrl, loginEmail, loginPassword, logStep });

    // Step 1 — profile snapshot before any charge.
    const profileBefore = await callApi(page, 'GET', '/api/profile');
    results.steps.profileBefore = {
      role: profileBefore.payload?.role,
      structuredFillCreditsThisMonth: profileBefore.payload?.structuredFillCreditsThisMonth,
      structuredFillCreditsRemaining: profileBefore.payload?.structuredFillCreditsRemaining,
      monthlyMax: profileBefore.payload?.limits?.structuredFillMonthlyMax,
    };
    logStep(`initial usage: ${results.steps.profileBefore.structuredFillCreditsThisMonth} / ${results.steps.profileBefore.monthlyMax}`);

    // Step 2 — precheck agrees with the profile.
    const precheck = await callApi(
      page,
      'GET',
      '/api/search-fill/precheck?pdfCount=1&sourceKind=csv',
    );
    results.steps.precheck = precheck.payload;
    if (precheck.payload?.monthlyLimit !== results.steps.profileBefore.monthlyMax) {
      throw new Error('Precheck monthlyLimit does not match /api/profile limits.structuredFillMonthlyMax');
    }

    // Step 3 — commit a single-template fill.
    const firstRequestId = `sf_smoke_${randomUUID()}`;
    const commitPayload = {
      requestId: firstRequestId,
      sourceCategory: 'structured_data',
      sourceKind: 'csv',
      scopeType: 'template',
      templateId: 'smoke-tpl-1',
      scopeId: 'smoke-tpl-1',
      targetTemplateIds: ['smoke-tpl-1'],
      matchedTemplateIds: ['smoke-tpl-1'],
      countIncrement: 1,
      matchCount: 1,
      recordLabelPreview: 'Smoke Record',
      recordFingerprint: 'smoke-fingerprint-1',
      dataSourceLabel: 'smoke.csv',
    };
    const firstCommit = await callApi(page, 'POST', '/api/search-fill/usage', { body: commitPayload });
    results.steps.firstCommit = firstCommit.payload;
    if (firstCommit.payload?.status !== 'committed') {
      throw new Error(`First commit should return status=committed, got ${firstCommit.payload?.status}`);
    }
    if (firstCommit.payload?.countIncrement !== 1) {
      throw new Error(`First commit should debit 1 credit, got ${firstCommit.payload?.countIncrement}`);
    }

    // Step 4 — idempotent replay.
    const replayCommit = await callApi(page, 'POST', '/api/search-fill/usage', { body: commitPayload });
    results.steps.replayCommit = replayCommit.payload;
    if (replayCommit.payload?.status !== 'replayed') {
      throw new Error(`Duplicate requestId should return status=replayed, got ${replayCommit.payload?.status}`);
    }
    if (replayCommit.payload?.eventId !== firstCommit.payload?.eventId) {
      throw new Error('Replayed commit should reference the original eventId.');
    }
    if (replayCommit.payload?.currentMonthUsage !== firstCommit.payload?.currentMonthUsage) {
      throw new Error('Replay must not advance currentMonthUsage.');
    }

    // Step 5 — no-match commit charges 0 and never blocks the fill flow.
    const noMatchPayload = {
      ...commitPayload,
      requestId: `sf_smoke_${randomUUID()}`,
      matchedTemplateIds: [],
      countIncrement: 0,
      matchCount: 0,
      recordLabelPreview: 'Smoke No Match',
    };
    const noMatchCommit = await callApi(page, 'POST', '/api/search-fill/usage', { body: noMatchPayload });
    results.steps.noMatchCommit = noMatchCommit.payload;
    if (noMatchCommit.payload?.status !== 'rejected_no_match') {
      throw new Error(`No-match commit should be rejected_no_match, got ${noMatchCommit.payload?.status}`);
    }
    if (noMatchCommit.payload?.countIncrement !== 0) {
      throw new Error(`No-match commit should charge 0 credits.`);
    }

    // Step 6 — profile usage increased by exactly 1.
    const profileAfter = await callApi(page, 'GET', '/api/profile');
    results.steps.profileAfter = {
      structuredFillCreditsThisMonth: profileAfter.payload?.structuredFillCreditsThisMonth,
      structuredFillCreditsRemaining: profileAfter.payload?.structuredFillCreditsRemaining,
      usageMonth: profileAfter.payload?.structuredFillUsageMonth,
    };
    const before = Number(results.steps.profileBefore.structuredFillCreditsThisMonth ?? 0);
    const after = Number(results.steps.profileAfter.structuredFillCreditsThisMonth ?? 0);
    if (after - before !== 1) {
      throw new Error(
        `Expected profile structured fill credits to increase by 1 (before=${before}, after=${after}). `
        + 'Double-check there are no other concurrent sessions charging the same account.',
      );
    }

    results.ok = true;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    logStep('smoke passed');
  } catch (error) {
    results.error = error instanceof Error ? error.message : String(error);
    results.currentUrl = page.url();
    await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
    console.error(error instanceof Error ? error.stack || error.message : String(error));
  } finally {
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
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
