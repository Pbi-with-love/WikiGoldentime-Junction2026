import fs from 'node:fs';
import path from 'node:path';
import { expect } from './fixtures.js';

const SCREENSHOT_DIR = path.resolve('artifacts/screenshots/e2e');

const LANG_LABELS = {
  en: 'English',
  fi: 'Suomi',
  sv: 'Svenska',
};

/**
 * Navigate to '/' if needed, end the intro sweep if active, and wait until
 * the slider reads 2026 and initial loading finishes.
 */
export async function ready(page) {
  if (page.url() === 'about:blank') {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  }

  const numeral = page.locator('#slider-year-numeral');
  await expect(numeral).toBeVisible({ timeout: 20_000 });

  // Wait for initial data fetch (#status-loading hidden)
  await expect(page.locator('#status-loading')).toBeHidden({ timeout: 20_000 });

  // End the intro sweep via the slider (End key). A canvas click would open a star's article panel
  // (it opened Suinulan verilöyly, id 8646) and leave it open for the rest of the test.
  if ((await numeral.textContent())?.trim() !== '2026') {
    await page.getByRole('slider', { name: 'Selected year in Wikipedia history' }).focus();
    await page.keyboard.press('End');
  }

  await expect(numeral).toHaveText('2026', { timeout: 15_000 });
}

/**
 * Switch UI language via #lang-switcher and wait for the page reload to settle.
 */
export async function setLang(page, lang) {
  const label = LANG_LABELS[lang];
  if (!label) throw new Error(`Unsupported lang: ${lang}`);

  const btn = page.locator('#lang-switcher').getByRole('button', { name: label, exact: true });
  await expect(btn).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#status-loading')).toBeHidden({ timeout: 20_000 });
  if (await page.locator('#road-top-bar').isVisible().catch(() => false)) {
    await expect
      .poll(
        () => page.locator('img:visible').evaluateAll((images) => images.every((image) => image.complete)),
        { timeout: 20_000 },
      )
      .toBe(true);
  }

  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    btn.click(),
  ]);

  await page.waitForFunction(
    (expected) => document.documentElement.lang === expected || localStorage.getItem('wikimemory.lang') === expected,
    lang,
    { timeout: 15_000 },
  );
}

/**
 * Save a screenshot to artifacts/screenshots/e2e/<name>.png.
 */
export async function shot(page, name) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  return filePath;
}

/**
 * Strip non-digits so "2,143" and "2 143" compare identically.
 */
export function digits(text) {
  return String(text || '').replace(/\D+/g, '');
}
