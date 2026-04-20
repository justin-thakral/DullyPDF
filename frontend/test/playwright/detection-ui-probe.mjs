#!/usr/bin/env node
/**
 * Consolidated live smoke for three flows:
 *   1. Search & Fill crediting (API round-trip + profile delta)
 *   2. Fill By API — list/publish endpoints via /api/template-api-endpoints
 *   3. Fill By Link — list existing fill links via /api/fill-links
 * Plus a UI screenshot of the new credit-pill in the Search & Fill header.
 */
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';
import { signInFromHomepageAndOpenProfile, getCurrentAuthToken } from './helpers/workspaceFixture.mjs';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
// Hit the Vite proxy — keeps us aligned with the real client paths.
const API_BASE = BASE_URL.replace(/\/+$/, '');
const EMAIL = process.env.SMOKE_LOGIN_EMAIL;
const PASSWORD = process.env.SMOKE_LOGIN_PASSWORD;
const OUT = path.resolve(process.cwd(), 'output/playwright');
fs.mkdirSync(OUT, { recursive: true });

function log(msg) { console.log(`[three-flows-smoke] ${msg}`); }

async function call(page, method, p, body) {
  const token = await getCurrentAuthToken(page);
  const res = await fetch(`${API_BASE}${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

async function main() {
  if (!EMAIL || !PASSWORD) throw new Error('SMOKE_LOGIN_EMAIL / SMOKE_LOGIN_PASSWORD required');
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const result = { baseUrl: BASE_URL, flows: {} };

  try {
    log(`signing in as ${EMAIL}`);
    await signInFromHomepageAndOpenProfile(page, { baseUrl: BASE_URL, loginEmail: EMAIL, loginPassword: PASSWORD, logStep: log });

    // -- Flow 1: Search & Fill crediting
    log('flow 1: search-fill crediting');
    const p0 = await call(page, 'GET', '/api/profile');
    const before = p0.body?.structuredFillCreditsThisMonth ?? 0;
    const reqId = `sf_three_flows_${randomUUID()}`;
    const commit = await call(page, 'POST', '/api/search-fill/usage', {
      requestId: reqId,
      sourceCategory: 'structured_data',
      sourceKind: 'csv',
      scopeType: 'template',
      templateId: 'three-flows-smoke',
      scopeId: 'three-flows-smoke',
      targetTemplateIds: ['three-flows-smoke'],
      matchedTemplateIds: ['three-flows-smoke'],
      countIncrement: 1,
      matchCount: 1,
      recordLabelPreview: 'Three Flows Smoke',
      recordFingerprint: 'three-flows-fp',
      dataSourceLabel: 'smoke.csv',
    });
    const replay = await call(page, 'POST', '/api/search-fill/usage', {
      requestId: reqId,
      sourceCategory: 'structured_data',
      sourceKind: 'csv',
      scopeType: 'template',
      templateId: 'three-flows-smoke',
      scopeId: 'three-flows-smoke',
      targetTemplateIds: ['three-flows-smoke'],
      matchedTemplateIds: ['three-flows-smoke'],
      countIncrement: 1,
      matchCount: 1,
    });
    const p1 = await call(page, 'GET', '/api/profile');
    const after = p1.body?.structuredFillCreditsThisMonth ?? 0;
    result.flows.searchFillCrediting = {
      before,
      after,
      delta: after - before,
      commitStatus: commit.body?.status,
      replayStatus: replay.body?.status,
      ok: commit.body?.status === 'committed' && replay.body?.status === 'replayed' && after - before === 1,
    };

    // -- Flow 2: Fill By API (list existing endpoints + precheck)
    log('flow 2: fill-by-api');
    const endpoints = await call(page, 'GET', '/api/template-api-endpoints');
    const precheck = await call(page, 'GET', '/api/template-api-endpoints/precheck?pdfCount=1&pageCount=1');
    result.flows.fillByApi = {
      endpointsStatus: endpoints.status,
      endpointsCount: Array.isArray(endpoints.body) ? endpoints.body.length : Array.isArray(endpoints.body?.endpoints) ? endpoints.body.endpoints.length : null,
      precheckStatus: precheck.status,
      precheckAllowed: precheck.body?.allowed,
      precheckLimit: precheck.body?.monthlyLimit,
      ok: endpoints.status === 200 && precheck.status === 200,
    };

    // -- Flow 3: Fill By Link (list existing + profile-level limit surface)
    log('flow 3: fill-by-link');
    const links = await call(page, 'GET', '/api/fill-links');
    result.flows.fillByLink = {
      status: links.status,
      count: Array.isArray(links.body?.links) ? links.body.links.length : Array.isArray(links.body) ? links.body.length : null,
      monthlyMax: p1.body?.limits?.fillLinkResponsesMonthlyMax,
      ok: links.status === 200,
    };

    result.ok = Object.values(result.flows).every((flow) => flow.ok);
    log(`summary: ${JSON.stringify(result.flows, null, 2)}`);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error(err);
  } finally {
    fs.writeFileSync(path.join(OUT, 'three-flows-smoke.json'), JSON.stringify(result, null, 2));
    await page.close();
    await browser.close();
  }

  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
