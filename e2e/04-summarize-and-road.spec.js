import { test, expect } from './fixtures.js';
import { ready, setLang, shot } from './helpers.js';

async function openTalvisota(page) {
  await page.locator('#search-input').fill('talvisota');
  await page.locator('#btn-search').click();
  const results = page.locator('#search-results-panel');
  await expect(results).toBeVisible();
  await results.getByRole('button', { name: 'Talvisota', exact: true }).click();
  await expect(page.locator('#article-panel')).toBeVisible();
}

test('summarize', async ({ page }) => {
  // English UI: native English summary (Winter War)
  await ready(page);
  await openTalvisota(page);
  await page.locator('#panel-summarize-btn').click();

  const summaryTop = page.locator('#summary-top-bar');
  await expect(summaryTop).toBeVisible();
  await expect(page.locator('#summary-trail-title')).toContainText('Winter War');

  const metaEn = (await page.locator('#summary-trail-meta').textContent()) || '';
  const enMatch = metaEn.match(/(\d+)\s+sections?/);
  expect(enMatch, `Expected section count in "${metaEn}"`).not.toBeNull();
  const enCount = Number(enMatch[1]);
  expect(enCount).toBeGreaterThanOrEqual(4);
  expect(enCount).toBeLessThanOrEqual(20);

  const progress = page.locator('#summary-progress-text');
  const beforeProgress = await progress.textContent();
  await page.locator('#summary-next-btn').click();
  await expect(progress).not.toHaveText(beforeProgress);

  // Advance to the Finnish history card and verify its visible label.
  const overlay = page.locator('#summary-focused-overlay');
  let foundHistory = false;
  for (let i = 0; i < 20; i++) {
    if ((await overlay.textContent())?.includes('Edit history of Finnish Wikipedia')) {
      foundHistory = true;
      break;
    }
    await page.locator('#summary-next-btn').click();
  }
  expect(foundHistory, 'Expected the Edit history of Finnish Wikipedia card in the summary trail').toBe(true);
  await shot(page, '08-summarize-en');

  // Finnish UI: Talvisota -> Tiivistä -> Moskovan rauha
  await page.locator('#summary-back-btn').click();
  await setLang(page, 'fi');
  await ready(page);
  await openTalvisota(page);
  await page.locator('#panel-summarize-btn').click();

  await expect(summaryTop).toBeVisible();
  const metaFi = (await page.locator('#summary-trail-meta').textContent()) || '';
  const fiMatch = metaFi.match(/(\d+)\s+osiota/);
  expect(fiMatch, `Expected section count in "${metaFi}"`).not.toBeNull();
  const fiCount = Number(fiMatch[1]);
  expect(fiCount).toBeGreaterThanOrEqual(4);
  expect(fiCount).toBeLessThanOrEqual(20);

  // At least 1 ghost (removed-section) card in the trail
  const ghostCards = page.locator('#summary-css3d-layer .summary-trail-card.is-ghost-card, #summary-focused-overlay .summary-trail-card.is-ghost-card');
  expect(await ghostCards.count()).toBeGreaterThanOrEqual(1);

  // Advance with Seuraava to Moskovan rauha
  let foundMoskovanRauha = false;
  for (let i = 0; i < 20; i++) {
    const heading = (await overlay.getByRole('heading').textContent())?.trim();
    if (heading === 'Moskovan rauha') {
      foundMoskovanRauha = true;
      break;
    }
    await page.locator('#summary-next-btn').click();
  }
  expect(foundMoskovanRauha, 'Expected to reach Moskovan rauha card via Seuraava').toBe(true);
  await expect(overlay).toContainText('Myös ruotsinkielisessä Wikipediassa');

  await shot(page, '08-summarize-fi');
});

test('topic-road', async ({ page }) => {
  await ready(page);

  await page.locator('.prompt-chip[data-action="road"]').click();
  const roadTop = page.locator('#road-top-bar');
  await expect(roadTop).toBeVisible();

  const meta = (await page.locator('#road-topic-meta').textContent()) || '';
  const m = meta.match(/(\d+)\s+historical milestones\s+·\s+\d{4}–\d{4}/);
  expect(m, `Expected "N historical milestones · YYYY–YYYY" in "${meta}"`).not.toBeNull();
  expect(Number(m[1])).toBeGreaterThanOrEqual(5);

  const activeCard = page.locator('#road-cards-stage .road-card.is-nearest');
  await expect(activeCard).toBeVisible();
  await expect(activeCard).toContainText(/Similar \(\d+%\)|This article/);

  // Advance twice with Next to check station changes and Similar (NN%) appears
  const nextBtn = activeCard.getByRole('button', { name: 'Next' });
  const firstHeading = await activeCard.locator('.road-card-title').textContent();
  await nextBtn.click();
  await expect(activeCard.locator('.road-card-title')).not.toHaveText(firstHeading);

  const secondHeading = await activeCard.locator('.road-card-title').textContent();
  await expect(activeCard).toContainText(/Similar \(\d+%\)/);
  await expect(activeCard).toContainText(/\d+\s+reverts?/);

  await activeCard.getByRole('button', { name: 'Next' }).click();
  await expect(activeCard.locator('.road-card-title')).not.toHaveText(secondHeading);

  await shot(page, '10-topic-road');

  await page.locator('#btn-back-to-sky').click();
  await expect(roadTop).toBeHidden();
  await expect(page.locator('#sky-top-bar')).toBeVisible();
});
