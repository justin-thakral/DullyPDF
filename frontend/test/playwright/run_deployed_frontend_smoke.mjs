import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const baseUrl = (process.env.PLAYWRIGHT_BASE_URL || 'https://dullypdf-dev.web.app').replace(/\/+$/, '');
const apiBaseUrl = (process.env.PLAYWRIGHT_API_URL || baseUrl).replace(/\/+$/, '');
const checkApiHealth = /^(1|true|yes|on)$/i.test(process.env.PLAYWRIGHT_CHECK_API_HEALTH || 'false');
const artifactDir = path.resolve(process.cwd(), 'output/playwright');
const screenshotPath = path.join(artifactDir, 'deployed-frontend-smoke.png');
const summaryPath = path.join(artifactDir, 'deployed-frontend-smoke.json');

function logStep(message) {
  console.log(`[deployed-frontend-smoke] ${message}`);
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const seoPage = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    logStep(`opening deployed homepage ${baseUrl}`);
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await Promise.race([
      page.locator('.homepage-container').waitFor({ timeout: 30000 }),
      page.getByRole('button', { name: /Try Now/i }).first().waitFor({ timeout: 30000 }),
    ]);

    let healthPayload = null;
    if (checkApiHealth) {
      logStep(`checking public health endpoint ${apiBaseUrl}/api/health`);
      const healthResponse = await page.request.get(`${apiBaseUrl}/api/health`, { timeout: 30000 });
      if (!healthResponse.ok()) {
        throw new Error(`Health endpoint returned ${healthResponse.status()}.`);
      }
      healthPayload = await healthResponse.json();
      if (healthPayload?.status !== 'ok') {
        throw new Error(`Health endpoint did not return status=ok. Payload: ${JSON.stringify(healthPayload)}`);
      }
    }

    logStep('verifying anonymous workspace entry path');
    await page.getByRole('button', { name: /Try Now/i }).first().click();
    await Promise.race([
      page.getByLabel('Email').waitFor({ timeout: 30000 }),
      page.getByText('Upload PDF for Field Detection').waitFor({ timeout: 30000 }),
    ]);

    logStep('checking prerendered SEO route');
    await seoPage.goto(`${baseUrl}/fill-pdf-from-csv`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await seoPage.locator('[data-seo-jsonld="true"]').first().waitFor({ state: 'attached', timeout: 30000 });

    await page.screenshot({ path: screenshotPath, fullPage: true });
    const summary = {
      ok: true,
      baseUrl,
      apiBaseUrl,
      screenshotPath,
      summaryPath,
      healthPayload,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await seoPage.close();
    await page.close();
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
