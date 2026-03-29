import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import {
  cleanupFixture,
  createCustomToken,
  createHybridEmailUser,
  deleteCurrentUserHarness,
  deleteUserByInitialToken,
  readFixtureState,
  seedDowngradedAccountFixture,
  signInWithCustomTokenHarness,
  signOutHarness,
} from './helpers/downgradeFixture.mjs';

const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'downgrade-retention-real-user.png');
const summaryPath = path.join(artifactDir, 'downgrade-retention-real-user.json');

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
      console.warn(`[playwright] ${label} attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`);
      await sleep(1500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function waitForRetentionDialog(page) {
  await retry('wait for retention dialog', 3, async () => {
    await page.goto(`${baseUrl}/ui/profile`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.getByRole('dialog', { name: 'Base plan template access' }).waitFor({ timeout: 30000 });
    await page.getByText('Accessible and locked saved forms').waitFor({ timeout: 10000 });
  });
}

function retentionDialog(page) {
  return page.getByRole('dialog', { name: 'Base plan template access' });
}

async function assertNoRetentionDialog(page) {
  await sleep(2500);
  if (await page.getByRole('dialog', { name: 'Base plan template access' }).isVisible().catch(() => false)) {
    throw new Error('Retention dialog should not be visible.');
  }
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });

  let userFixture = null;
  let fixtureUid = null;

  try {
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    userFixture = await createHybridEmailUser(page);
    fixtureUid = userFixture.uid;
    const seeded = seedDowngradedAccountFixture({ uid: fixtureUid, email: userFixture.email });
    const customToken = createCustomToken(fixtureUid);

    await signInWithCustomTokenHarness(page, customToken);
    await waitForRetentionDialog(page);

    const dialog = retentionDialog(page);
    await dialog.getByText('Locked templates', { exact: true }).waitFor({ timeout: 10000 });
    await dialog.getByText('Locked links', { exact: true }).waitFor({ timeout: 10000 });
    await dialog.getByText('Manual swapping is not available in this policy version.').waitFor({ timeout: 10000 });

    const accessibleCount = await dialog.getByText('Accessible', { exact: true }).count();
    const lockedCount = await dialog.getByText('Locked', { exact: true }).count();
    if (accessibleCount < 4) {
      throw new Error(`Expected multiple accessible markers, found ${accessibleCount}`);
    }
    if (lockedCount < 1) {
      throw new Error(`Expected at least one locked marker, found ${lockedCount}`);
    }

    const initialState = await retry('verify locked access state', 10, async () => {
      const state = readFixtureState(fixtureUid);
      const accessibleTemplateIds = state.retention?.kept_template_ids || [];
      const lockedTemplateIds = state.retention?.pending_delete_template_ids || [];
      if (accessibleTemplateIds.join('|') !== [
        `${fixtureUid}-tpl-alpha`,
        `${fixtureUid}-tpl-beta`,
        `${fixtureUid}-tpl-gamma`,
      ].join('|')) {
        throw new Error(`Unexpected accessible template ids: ${JSON.stringify(accessibleTemplateIds)}`);
      }
      if (lockedTemplateIds.join('|') !== `${fixtureUid}-tpl-delta`) {
        throw new Error(`Unexpected locked template ids: ${JSON.stringify(lockedTemplateIds)}`);
      }
      if (state.templates.length !== 4) {
        throw new Error(`Templates should remain preserved on downgrade. Found ${state.templates.length}.`);
      }
      if (!state.templates.some((template) => template.id === `${fixtureUid}-tpl-delta`)) {
        throw new Error('Locked template should still exist after downgrade.');
      }
      return state;
    });

    await dialog.getByRole('button', { name: 'Keep base plan' }).click();
    await assertNoRetentionDialog(page);
    await page.getByRole('button', { name: 'Review locked templates' }).click();
    await page.getByRole('dialog', { name: 'Base plan template access' }).waitFor({ timeout: 10000 });

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const summary = {
      ok: true,
      uid: fixtureUid,
      email: userFixture.email,
      initialRetention: seeded.summary,
      lockedAccessState: initialState,
      screenshotPath,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify({ ok: true, screenshotPath, summaryPath, uid: fixtureUid }));
  } finally {
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
    if (fixtureUid) {
      try {
        cleanupFixture(fixtureUid);
      } catch (error) {
        console.warn(`[playwright] cleanup failed for ${fixtureUid}: ${error instanceof Error ? error.message : String(error)}`);
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
