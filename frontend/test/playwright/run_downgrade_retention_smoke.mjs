import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'downgrade-retention-smoke.png');
const eventsPath = path.join(artifactDir, 'downgrade-retention-smoke-events.json');

const retentionSummary = {
  status: 'grace_period',
  policyVersion: 2,
  downgradedAt: '2026-03-01T00:00:00Z',
  graceEndsAt: null,
  daysRemaining: 0,
  savedFormsLimit: 5,
  keptTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3', 'tpl-4', 'tpl-5'],
  pendingDeleteTemplateIds: ['tpl-6', 'tpl-7'],
  pendingDeleteLinkIds: ['link-6'],
  accessibleTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3', 'tpl-4', 'tpl-5'],
  lockedTemplateIds: ['tpl-6', 'tpl-7'],
  lockedLinkIds: ['link-6'],
  selectionMode: 'oldest_created',
  manualSelectionAllowed: false,
  counts: {
    keptTemplates: 5,
    pendingTemplates: 2,
    accessibleTemplates: 5,
    lockedTemplates: 2,
    affectedGroups: 1,
    pendingLinks: 1,
    closedLinks: 1,
    lockedLinks: 1,
    affectedSigningRequests: 3,
    affectedSigningDrafts: 1,
    retainedSigningRequests: 2,
    completedSigningRequests: 1,
  },
  templates: [
    { id: 'tpl-1', name: 'Template One', createdAt: '2026-01-01T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-2', name: 'Template Two', createdAt: '2026-01-02T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-3', name: 'Template Three', createdAt: '2026-01-03T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-4', name: 'Template Four', createdAt: '2026-01-04T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-5', name: 'Template Five', createdAt: '2026-01-05T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-6', name: 'Template Six', createdAt: '2026-01-06T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
    { id: 'tpl-7', name: 'Template Seven', createdAt: '2026-01-07T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
  ],
  groups: [{ id: 'group-1', name: 'Admissions Packet', templateCount: 7, pendingTemplateCount: 2, willDelete: false, accessStatus: 'locked', locked: true, lockedTemplateIds: ['tpl-6', 'tpl-7'] }],
  links: [{ id: 'link-6', title: 'Template Six Link', scopeType: 'template', status: 'closed', templateId: 'tpl-6', pendingDeleteReason: 'template_pending_delete', accessStatus: 'locked', locked: true }],
};

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.evaluate(async (summary) => {
      window.__PW_RETENTION_SUMMARY__ = summary;
      window.__PW_RETENTION_LIMITS__ = {
        savedFormsMax: 5,
        fillLinkResponsesMonthlyMax: 25,
        templateApiRequestsMonthlyMax: 250,
      };
      window.__PW_RETENTION_PROFILE__ = {
        creditsRemaining: 10,
        availableCredits: 10,
      };
      await import('/src/testSupport/playwrightDowngradeRetentionHarness.tsx');
    }, retentionSummary);

    await page.getByRole('dialog', { name: 'Base plan template access' }).waitFor({ timeout: 10000 });
    await page.getByText('5 accessible').waitFor({ timeout: 10000 });
    await page.getByText('2 locked').waitFor({ timeout: 10000 });
    await page.screenshot({ path: screenshotPath, fullPage: true });

    await page.getByRole('button', { name: 'Keep base plan' }).click();
    await page.getByRole('button', { name: 'Review locked templates' }).click();
    await page.getByRole('button', { name: 'Reactivate Pro Monthly' }).click();

    const events = await page.evaluate(() => window.__PW_RETENTION_EVENTS__ || []);
    fs.writeFileSync(eventsPath, JSON.stringify(events, null, 2));

    for (const eventType of ['close', 'profile-open', 'reactivate']) {
      if (!events.some((event) => event.type === eventType)) {
        throw new Error(`Missing ${eventType} event from downgrade retention harness.`);
      }
    }

    console.log(JSON.stringify({ ok: true, screenshotPath, eventsPath, eventCount: events.length }));
  } finally {
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
