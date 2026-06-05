import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname);
const BASE_URL = process.env.TARGET_URL || 'http://localhost:4173';

const JOURNEYS = [
  {
    name: 'home-to-playground',
    videoDir: 'home-to-playground',
    fn: async (page) => {
      // 1. Homepage
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      // 2. Navigate to Playground
      await page.click('a[href="/playground"]');
      await page.waitForTimeout(2000);
    }
  },
  {
    name: 'theme-toggle',
    videoDir: 'theme-toggle',
    fn: async (page) => {
      await page.goto(`${BASE_URL}/`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      // Use dispatchEvent to toggle even if element is occluded
      await page.evaluate(() => {
        const btn = document.querySelector('button[title*="Switch"]');
        if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const btn = document.querySelector('button[title*="Switch"]');
        if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        const btn = document.querySelector('button[title*="Switch"]');
        if (btn) {
          btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      });
      await page.waitForTimeout(1000);
    }
  },
  {
    name: 'api-scroll',
    videoDir: 'api-scroll',
    fn: async (page) => {
      await page.goto(`${BASE_URL}/api`, { waitUntil: 'load', timeout: 30000 });
      await page.waitForTimeout(2000);
      // Scroll down the API page
      await page.evaluate(() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
      await page.waitForTimeout(300);
      const scrollSteps = 8;
      for (let i = 1; i <= scrollSteps; i++) {
        await page.evaluate((step) => {
          window.scrollTo({ top: (document.body.scrollHeight / 10) * step, behavior: 'smooth' });
        }, i);
        await page.waitForTimeout(400);
      }
      await page.waitForTimeout(1000);
    }
  }
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-software-rasterizer']
  });

  for (const journey of JOURNEYS) {
    const videoDir = resolve(OUTPUT_DIR, journey.videoDir);
    mkdirSync(videoDir, { recursive: true });

    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } }
    });
    const page = await context.newPage();

    try {
      console.log(`[START] ${journey.name}`);
      await journey.fn(page);
      await page.waitForTimeout(500);
      console.log(`[OK] ${journey.name}`);
    } catch (err) {
      console.error(`[FAIL] ${journey.name} - ${err.message}`);
    } finally {
      await context.close();
    }
  }

  await browser.close();

  // Rename .webm files to match journey names
  const { readdirSync, renameSync } = await import('fs');
  for (const journey of JOURNEYS) {
    const videoDir = resolve(OUTPUT_DIR, journey.videoDir);
    try {
      const files = readdirSync(videoDir).filter(f => f.endsWith('.webm'));
      if (files.length > 0) {
        const src = resolve(videoDir, files[0]);
        const dst = resolve(OUTPUT_DIR, `${journey.name}.webm`);
        renameSync(src, dst);
        console.log(`[RENAME] ${files[0]} -> ${journey.name}.webm`);
      } else {
        console.error(`[WARN] No webm found for ${journey.name}`);
      }
    } catch (err) {
      console.error(`[ERROR] Renaming ${journey.name}: ${err.message}`);
    }
  }

  console.log('\nAll captures complete.');
}

main().catch(console.error);