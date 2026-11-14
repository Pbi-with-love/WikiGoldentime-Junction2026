import { test, expect } from './fixtures.js';
import { ready, shot } from './helpers.js';

test('slider', async ({ page }) => {
  await ready(page);

  const track = page.getByRole('slider', { name: 'Selected year in Wikipedia history' });
  const numeral = page.locator('#slider-year-numeral');

  await track.focus();
  await page.keyboard.press('Home');
  await expect(numeral).toHaveText('2001');
  await expect(track).toHaveAttribute('aria-valuenow', '2001');

  await page.keyboard.press('End');
  await expect(numeral).toHaveText('2026');
  await expect(track).toHaveAttribute('aria-valuenow', '2026');

  await shot(page, '01-slider');
});

test('search-also', async ({ page }) => {
  await ready(page);

  await page.locator('#search-input').fill('talvisota');
  await page.locator('#btn-search').click();

  const resultsPanel = page.locator('#search-results-panel');
  await expect(resultsPanel).toBeVisible();

  const resultButtons = await resultsPanel.getByRole('button').allTextContents();
  const resultTitles = resultButtons.map((text) => text.trim()).filter((text) => !/^(Close|fi|sv|en)$/.test(text));
  expect(resultTitles.length).toBeGreaterThanOrEqual(5);

  const talvisotaRow = resultsPanel.getByRole('button', { name: 'Talvisota', exact: true }).locator('xpath=..');
  await expect(talvisotaRow).toBeVisible();
  await expect(talvisotaRow).toContainText('sv');
  await expect(talvisotaRow).toContainText('en');

  await expect(resultsPanel).toContainText('Vinterkriget');
  await expect(resultsPanel).toContainText('Winter War');

  await shot(page, '02-search-also');
});

test('article-panel', async ({ page }) => {
  await ready(page);

  await page.locator('#search-input').fill('talvisota');
  await page.locator('#btn-search').click();

  const resultsPanel = page.locator('#search-results-panel');
  await expect(resultsPanel).toBeVisible();
  await resultsPanel.getByRole('button', { name: 'Talvisota', exact: true }).click();

  const panel = page.locator('#article-panel');
  await expect(panel).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Talvisota');

  await expect(page.locator('#panel-thumb-img')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#panel-thumb-caption')).toHaveText(/^Image: .+, (Public domain|CC .+)/, {
    timeout: 5000,
  });

  await expect(page.locator('#panel-summarize-btn')).toHaveText('Summarize');
  await expect(page.locator('#panel-road-btn')).toHaveText('See as a road');
  await expect(page.locator('#panel-close-btn')).toHaveText('Close');

  await shot(page, '03-article-panel');
});

test('star-click', async ({ page }) => {
  await ready(page);

  const closeBtn = page.locator('#panel-close-btn');
  if (await closeBtn.isVisible()) {
    await closeBtn.click();
  }

  const canvas = page.locator('#galaxy-canvas');
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();

  // Fixed 5x3 grid of points around the center of the galaxy canvas (15 points max)
  const xs = [0.5, 0.44, 0.56, 0.38, 0.62];
  const ys = [0.5, 0.42, 0.58];
  const points = [];
  for (const ry of ys) {
    for (const rx of xs) {
      points.push({ x: Math.round(box.width * rx), y: Math.round(box.height * ry) });
    }
  }

  let openedPoint = null;
  const panel = page.locator('#article-panel');
  for (const pt of points) {
    await canvas.click({ position: pt });
    try {
      await panel.waitFor({ state: 'visible', timeout: 700 });
      openedPoint = pt;
      break;
    } catch {
      // Try next grid point
    }
  }

  expect(openedPoint, 'Expected clicking fixed grid points on #galaxy-canvas to open an article panel').not.toBeNull();
  console.log(`[star-click] Opened panel at (${openedPoint.x}, ${openedPoint.y})`);

  await expect(page.locator('#panel-title')).not.toHaveText('', { timeout: 5000 });
  await expect(page.locator('#status-loading')).toBeHidden({ timeout: 5000 });
  await expect(panel).not.toContainText('Loading…');

  await shot(page, '04-star-click');
});
