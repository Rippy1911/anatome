import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, '../../screenshots/run1');
const BASE_URL = process.env.TARGET_URL || 'http://localhost:4173';

const SCENES = [
  { name: 'homepage', path: '/', viewport: { width: 1280, height: 800 } },
  { name: 'playground', path: '/playground', viewport: { width: 1280, height: 800 } },
  { name: 'docs', path: '/docs', viewport: { width: 1280, height: 800 } },
];

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (const scene of SCENES) {
    const url = `${BASE_URL}${scene.path}`;
    const filename = `${scene.name}.png`;
    const filepath = `${OUTPUT_DIR}/${filename}`;
    try {
      await page.setViewportSize(scene.viewport);
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000);
      await page.screenshot({ path: filepath, fullPage: true });
      console.log(`[OK] ${filename}`);
    } catch (err) {
      console.error(`[FAIL] ${filename} - ${err.message}`);
    }
  }

  await browser.close();
  console.log(`\nScreenshots saved to ${OUTPUT_DIR}`);
}

main().catch(console.error);