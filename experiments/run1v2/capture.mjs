import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:4173';
const OUTPUT_DIR = __dirname;

async function capture(url, outputFile) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    // Extra wait for dynamic content
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, outputFile),
      fullPage: true,
    });
    console.log(`✓ Captured ${url} → ${outputFile}`);
  } catch (err) {
    console.error(`✗ Failed to capture ${url}: ${err.message}`);
  } finally {
    await browser.close();
  }
}

(async () => {
  console.log('Starting Playwright captures...\n');

  await capture(`${BASE_URL}/`, 'local-home.png');
  await capture(`${BASE_URL}/playground`, 'local-playground.png');
  await capture(`${BASE_URL}/docs`, 'local-docs.png');

  console.log('\nDone.');
})();