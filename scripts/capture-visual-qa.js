import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'playground', path: '/playground' },
  { name: 'docs', path: '/docs' },
  { name: 'aiguide', path: '/ai-guide' },
  { name: 'api', path: '/api' },
];

const VIEWPORTS = [
  { name: '390x844', w: 390, h: 844 },
  { name: '768x1024', w: 768, h: 1024 },
  { name: '1366x768', w: 1366, h: 768 },
  { name: '1920x1080', w: 1920, h: 1080 },
];

const THEMES = ['light', 'dark'];
const BASE_URL = process.env.TARGET_URL || 'https://anatome.dev';
const OUTPUT_DIR = 'screenshots/before';

async function main() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  let context;
  let total = PAGES.length * VIEWPORTS.length * THEMES.length;
  let captured = 0;
  let failed = 0;

  for (const theme of THEMES) {
    context = await browser.newContext({
      colorScheme: theme === 'dark' ? 'dark' : 'light',
      storageState: undefined,
    });
    const page = await context.newPage();

    for (const vp of VIEWPORTS) {
      await page.setViewportSize({ width: vp.w, height: vp.h });

      for (const pg of PAGES) {
        const url = `${BASE_URL}${pg.path}`;
        const filename = `${pg.name}-${vp.name}-${theme}.png`;
        const filepath = `${OUTPUT_DIR}/${filename}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
          // Apply theme via localStorage
          await page.evaluate((t) => {
            localStorage.setItem('anatome-theme', t);
            if (t === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
          }, theme);
          await page.waitForTimeout(1000);
          await page.screenshot({ path: filepath, fullPage: true });
          captured++;
          console.log(`[OK] ${filename}`);
        } catch (err) {
          failed++;
          console.log(`[FAIL] ${filename} - ${err.message}`);
        }
      }
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nDone: ${captured}/${total} captured, ${failed} failed`);
}

main().catch(console.error);