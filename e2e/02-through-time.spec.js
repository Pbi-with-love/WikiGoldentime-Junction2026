import { test, expect } from './fixtures.js';
import { ready, setLang, shot, digits } from './helpers.js';

async function openTalvisota(page) {
  await page.locator('#search-input').fill('talvisota');
  await page.locator('#btn-search').click();
  const results = page.locator('#search-results-panel');
  await expect(results).toBeVisible();
  await results.getByRole('button', { name: 'Talvisota', exact: true }).click();
  await expect(page.locator('#article-panel')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Talvisota');
}

test('asof-2006', async ({ page }) => {
  // English UI
  await ready(page);
  await openTalvisota(page);

  await page.locator('#tab-btn-history').click();
  const summary = page.locator('#panel-svt-summary');
  await expect(summary).toBeVisible();

  const summaryText = await summary.innerText();
  expect(digits(summaryText)).toContain('2143');
  expect(digits(summaryText)).toContain('328');
  expect(digits(summaryText)).toContain('88');
  expect(digits(summaryText)).toContain('7');

  await page.locator('#panel-svt-presets').getByRole('button', { name: 'As of 2006' }).click();
  const asofMeta = page.locator('#panel-asof-meta');
  await expect(asofMeta).toContainText('Edited by Höyhens on 29 Dec 2006');
  await expect(asofMeta).toContainText('oldid=2114325');
  await expect(page.locator('#slider-year-numeral')).toHaveText('2006');
  await shot(page, '05-asof-2006-en');

  // Finnish UI
  await setLang(page, 'fi');
  await ready(page);
  await openTalvisota(page);

  await page.locator('#tab-btn-history').click();
  await expect(page.locator('#panel-svt-summary')).toBeVisible();
  await page.locator('#panel-svt-presets').getByRole('button', { name: 'Tilanne 2006' }).click();

  await expect(asofMeta).toContainText('Höyhens');
  await expect(asofMeta).toContainText('29.12.2006');
  await expect(asofMeta).toContainText('oldid=2114325');
  await expect(page.locator('#slider-year-numeral')).toHaveText('2006');
  await shot(page, '05-asof-2006-fi');
});

test('through-time-trail', async ({ page }) => {
  await ready(page);
  await openTalvisota(page);

  await page.locator('#tab-btn-history').click();
  await expect(page.locator('#panel-svt-summary')).toBeVisible();

  await page.locator('#panel-road-btn').click();
  const roadBar = page.locator('#road-top-bar');
  await expect(roadBar).toBeVisible();
  await expect(page.locator('#road-cards-stage')).toBeVisible();
  await shot(page, '09-through-time-trail');

  await page.locator('#btn-back-to-sky').click();
  await expect(roadBar).toBeHidden();
  await expect(page.locator('#sky-top-bar')).toBeVisible();
});
