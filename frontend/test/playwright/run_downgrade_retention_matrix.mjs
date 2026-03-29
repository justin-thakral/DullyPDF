import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const resultsPath = path.join(artifactDir, 'downgrade-retention-matrix.json');

const defaultRetention = {
  status: 'grace_period',
  policyVersion: 2,
  downgradedAt: '2026-03-01T00:00:00Z',
  graceEndsAt: null,
  daysRemaining: 0,
  savedFormsLimit: 3,
  keptTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3'],
  pendingDeleteTemplateIds: ['tpl-4'],
  pendingDeleteLinkIds: ['link-4'],
  accessibleTemplateIds: ['tpl-1', 'tpl-2', 'tpl-3'],
  lockedTemplateIds: ['tpl-4'],
  lockedLinkIds: ['link-4'],
  selectionMode: 'oldest_created',
  manualSelectionAllowed: false,
  counts: {
    keptTemplates: 3,
    pendingTemplates: 1,
    affectedGroups: 1,
    pendingLinks: 1,
    closedLinks: 1,
    affectedSigningRequests: 3,
    affectedSigningDrafts: 1,
    retainedSigningRequests: 2,
    completedSigningRequests: 1,
  },
  templates: [
    { id: 'tpl-1', name: 'Template One', createdAt: '2026-01-01T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-2', name: 'Template Two', createdAt: '2026-01-02T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-3', name: 'Template Three', createdAt: '2026-01-03T00:00:00Z', status: 'kept', accessStatus: 'accessible' },
    { id: 'tpl-4', name: 'Template Four', createdAt: '2026-01-04T00:00:00Z', status: 'pending_delete', accessStatus: 'locked', locked: true },
  ],
  groups: [{ id: 'group-1', name: 'Admissions Packet', templateCount: 4, pendingTemplateCount: 1, willDelete: false, accessStatus: 'locked', locked: true, lockedTemplateIds: ['tpl-4'] }],
  links: [{ id: 'link-4', title: 'Template Four Link', scopeType: 'template', status: 'closed', templateId: 'tpl-4', pendingDeleteReason: 'template_pending_delete', accessStatus: 'locked', locked: true }],
};

function createManualSelectionRetention() {
  return {
    ...defaultRetention,
    manualSelectionAllowed: true,
  };
}

async function mountHarness(page, retentionSummary, options = {}) {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.evaluate(async ({ summary, harnessOptions }) => {
    window.__PW_RETENTION_SUMMARY__ = summary;
    window.__PW_RETENTION_OPTIONS__ = harnessOptions;
    await import('/src/testSupport/playwrightDowngradeRetentionHarness.tsx');
  }, { summary: retentionSummary, harnessOptions: options });
  await page.getByRole('dialog', { name: 'Base plan template access' }).waitFor({ timeout: 10000 });
}

async function runScenario(browser, name, run) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  try {
    const result = await run(page);
    return { name, ok: true, ...result };
  } finally {
    await page.close();
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    const scenarios = [];

    scenarios.push(await runScenario(browser, 'default-lock-flow', async (page) => {
      await mountHarness(page, defaultRetention);
      const screenshotPath = path.join(artifactDir, 'downgrade-retention-default-lock-flow.png');

      await page.getByRole('button', { name: 'Keep base plan' }).click();
      await page.getByRole('button', { name: 'Review locked templates' }).click();
      await page.getByRole('button', { name: 'Reactivate Pro Monthly' }).click();
      await page.screenshot({ path: screenshotPath, fullPage: true });

      const events = await page.evaluate(() => window.__PW_RETENTION_EVENTS__ || []);
      for (const eventType of ['close', 'profile-open', 'reactivate']) {
        if (!events.some((event) => event.type === eventType)) {
          throw new Error(`Missing ${eventType} event in default-lock-flow scenario.`);
        }
      }
      if (events.some((event) => event.type === 'save')) {
        throw new Error(`Unexpected save event in default-lock-flow scenario: ${JSON.stringify(events)}`);
      }
      return { screenshotPath, eventCount: events.length };
    }));

    scenarios.push(await runScenario(browser, 'billing-disabled', async (page) => {
      await mountHarness(page, defaultRetention, { billingEnabled: false });
      const reactivateButton = page.getByRole('button', { name: 'Reactivate Pro Monthly' });
      if (!(await reactivateButton.isDisabled())) {
        throw new Error('Reactivate button should be disabled when billing is unavailable.');
      }
      await page.getByText('Stripe billing is currently unavailable, so reactivation is temporarily disabled.').waitFor({ timeout: 10000 });
      return {};
    }));

    scenarios.push(await runScenario(browser, 'checkout-busy', async (page) => {
      await mountHarness(page, defaultRetention, { checkoutInProgress: true });
      for (const name of ['Keep base plan', 'Starting checkout...']) {
        const button = page.getByRole('button', { name });
        if (!(await button.isDisabled())) {
          throw new Error(`${name} should be disabled while checkout is in progress.`);
        }
      }
      return {};
    }));

    scenarios.push(await runScenario(browser, 'legacy-manual-selection', async (page) => {
      await mountHarness(page, createManualSelectionRetention());
      const checkboxes = page.getByRole('checkbox');
      await checkboxes.nth(2).click();
      await checkboxes.nth(3).click();
      await page.getByRole('button', { name: 'Save kept forms' }).click();

      const events = await page.evaluate(() => window.__PW_RETENTION_EVENTS__ || []);
      const saveEvent = events.find((event) => event.type === 'save');
      if (!saveEvent) {
        throw new Error('Missing save event in legacy-manual-selection scenario.');
      }
      const keptTemplateIds = Array.isArray(saveEvent.keptTemplateIds) ? saveEvent.keptTemplateIds : [];
      if (keptTemplateIds.join('|') !== 'tpl-1|tpl-2|tpl-4') {
        throw new Error(`Unexpected keptTemplateIds payload: ${JSON.stringify(keptTemplateIds)}`);
      }
      return { eventCount: events.length };
    }));

    fs.writeFileSync(resultsPath, JSON.stringify(scenarios, null, 2));
    console.log(JSON.stringify({ ok: true, scenarioCount: scenarios.length, resultsPath }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
