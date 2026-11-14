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

test('lang-switch-views', async ({ page }) => {
  await ready(page);

  // 1. Sky view: fi -> sv -> en
  await setLang(page, 'fi');
  await ready(page);
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#btn-search')).toHaveText('Hae');
  await shot(page, '11-lang-sky-fi');

  await setLang(page, 'sv');
  await ready(page);
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#btn-search')).toHaveText('Sök');
  await shot(page, '11-lang-sky-sv');

  await setLang(page, 'en');
  await ready(page);
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#btn-search')).toHaveText('Search');
  await shot(page, '11-lang-sky-en');

  // 2. Article panel: fi -> sv -> en
  await setLang(page, 'fi');
  await ready(page);
  await openTalvisota(page);
  await expect(page.locator('#panel-summarize-btn')).toHaveText('Tiivistä');
  await shot(page, '11-lang-article-fi');

  await setLang(page, 'sv');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#article-panel')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Talvisota');
  await expect(page.locator('#panel-summarize-btn')).toHaveText('Sammanfatta');
  await shot(page, '11-lang-article-sv');

  await setLang(page, 'en');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#article-panel')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Talvisota');
  await expect(page.locator('#panel-summarize-btn')).toHaveText('Summarize');
  await shot(page, '11-lang-article-en');

  // 3. Summary Trail: fi -> sv -> en
  await setLang(page, 'fi');
  await expect(page.locator('#article-panel')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Talvisota');
  await page.locator('#panel-summarize-btn').click();
  await expect(page.locator('#summary-top-bar')).toBeVisible();
  await expect(page.locator('#summary-back-btn')).toHaveText('Takaisin taivaalle');
  await shot(page, '11-lang-summary-fi');

  await setLang(page, 'sv');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#summary-top-bar')).toBeVisible();
  await expect(page.locator('#summary-back-btn')).toHaveText('Tillbaka till himlen');
  await shot(page, '11-lang-summary-sv');

  await setLang(page, 'en');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#summary-top-bar')).toBeVisible();
  await expect(page.locator('#summary-back-btn')).toHaveText('Back to the sky');
  await shot(page, '11-lang-summary-en');
  await page.locator('#summary-back-btn').click();
  await expect(page.locator('#status-loading')).toBeHidden({ timeout: 20_000 });

  // 4. Topic Road: fi -> sv -> en
  await setLang(page, 'fi');
  await ready(page);
  await page.locator('.prompt-chip[data-action="road"]').click();
  await expect(page.locator('#road-top-bar')).toBeVisible();
  await expect(page.locator('#btn-back-to-sky')).toHaveText('Takaisin taivaalle');
  await shot(page, '11-lang-road-fi');

  await setLang(page, 'sv');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#road-top-bar')).toBeVisible();
  await expect(page.locator('#btn-back-to-sky')).toHaveText('Tillbaka till himlen');
  await shot(page, '11-lang-road-sv');

  await setLang(page, 'en');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(page.locator('#road-top-bar')).toBeVisible();
  await expect(page.locator('#btn-back-to-sky')).toHaveText('Back to the sky');
  await shot(page, '11-lang-road-en');
  await page.locator('#btn-back-to-sky').click();
  await expect(page.locator('#status-loading')).toBeHidden({ timeout: 20_000 });

  // 5. Ask answer: open the cached English question, then switch fi -> sv -> en.
  await page.locator('.prompt-chip[data-action="ask"]').click();
  const askPanel = page.locator('#ask-panel');
  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText('Based on');

  await setLang(page, 'fi');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText('Konekäännös englannista');
  await shot(page, '11-lang-ask-fi');

  await setLang(page, 'sv');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText(/Maskinöversatt|Baserat på/);
  await expect(askPanel.getByRole('link', { name: 'oldid=1862876', exact: true })).toBeVisible();
  await shot(page, '11-lang-ask-sv');

  await setLang(page, 'en');
  await expect(page.locator('#lang-switcher')).toBeVisible();
  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText(/Based on|Machine-translated/);
  await expect(askPanel.getByRole('link', { name: 'oldid=1862876', exact: true })).toBeVisible();
  await shot(page, '11-lang-ask-en');
});

test('lang-switch-summary-section', async ({ page }) => {
  await ready(page);
  await setLang(page, 'fi');
  await ready(page);
  await openTalvisota(page);
  await page.locator('#panel-summarize-btn').click();
  await expect(page.locator('#summary-top-bar')).toBeVisible();

  const overlay = page.locator('#summary-focused-overlay');
  let found = false;
  for (let i = 0; i < 20; i++) {
    const heading = (await overlay.getByRole('heading').textContent())?.trim();
    if (heading === 'Moskovan rauha') {
      found = true;
      break;
    }
    await page.locator('#summary-next-btn').click();
  }
  expect(found, 'Expected to reach Moskovan rauha in fi').toBe(true);

  const readCardState = async () => {
    const card = overlay.locator('.summary-trail-card').first();
    const isGhost = await card.evaluate((el) => el.classList.contains('is-ghost-card'));
    const heading = (await overlay.locator('.summary-trail-title').textContent())?.trim();
    return { heading, kind: isGhost ? 'ghost' : 'kept' };
  };

  const fiState = await readCardState();
  console.log('[lang-switch-summary-section] fi:', fiState);
  expect(fiState.kind).toBe('kept');
  await shot(page, '12-summary-section-fi');

  await setLang(page, 'sv');
  await expect(overlay).toBeVisible();
  const svState = await readCardState();
  console.log('[lang-switch-summary-section] sv:', svState);
  expect(svState.kind).toBe('kept');
  expect(svState.heading).toBe('Fredsavtalet');
  await expect(overlay).toContainText('Fredsavtalet');
  await shot(page, '12-summary-section-sv');

  await setLang(page, 'en');
  await expect(overlay).toBeVisible();
  const enState = await readCardState();
  console.log('[lang-switch-summary-section] en:', enState);
  expect(enState.kind).toBe('kept');
  expect(enState.heading).not.toBe('');
  await shot(page, '12-summary-section-en');
});

async function assertGeoLayout(page, { unlocatedLabel }) {
  await page.waitForTimeout(3000);

  const result = await page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const topBar = document.getElementById('sky-top-bar')?.getBoundingClientRect();
    const slider = document.getElementById('timeslider-root')?.getBoundingClientRect();

    const intersects = (a, b) =>
      a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

    const guides = Array.from(document.querySelectorAll('.projected-lens-guide'))
      .filter((el) => !el.hidden && el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          text: el.textContent?.trim() || '',
          rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height },
        };
      });

    const outOfViewport = guides.filter(
      (g) => g.rect.left < 0 || g.rect.top < 0 || g.rect.right > vw || g.rect.bottom > vh,
    );
    const hitsTopBar = guides.filter((g) => intersects(g.rect, topBar));
    const hitsSlider = guides.filter((g) => intersects(g.rect, slider));

    const overlappingPairs = [];
    for (let i = 0; i < guides.length; i++) {
      for (let j = i + 1; j < guides.length; j++) {
        if (intersects(guides[i].rect, guides[j].rect)) {
          overlappingPairs.push([guides[i].text, guides[j].text]);
        }
      }
    }

    return { guides, outOfViewport, hitsTopBar, hitsSlider, overlappingPairs };
  });

  expect(result.guides.length).toBeGreaterThan(0);
  expect(result.outOfViewport, 'Labels outside viewport').toEqual([]);
  expect(result.hitsTopBar, 'Labels intersecting #sky-top-bar').toEqual([]);
  expect(result.hitsSlider, 'Labels intersecting #timeslider-root').toEqual([]);
  expect(result.overlappingPairs, 'Intersecting label pairs').toEqual([]);

  const texts = result.guides.map((g) => g.text);
  for (const city of ['Helsinki', 'Turku', 'Tampere', 'Oulu', 'Rovaniemi']) {
    expect(texts.some((t) => t.includes(city)), `Expected city ${city} in ${JSON.stringify(texts)}`).toBe(true);
  }
  expect(
    texts.some((t) => t.includes(unlocatedLabel)),
    `Expected "${unlocatedLabel}" in ${JSON.stringify(texts)}`,
  ).toBe(true);
}

test('geography', async ({ page }) => {
  const failures = [];
  const check = async (label, options) => {
    try {
      await assertGeoLayout(page, options);
    } catch (error) {
      failures.push(`${label}: ${error.message}`);
    }
  };

  // 1. en 1280x720
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  await page.locator('#lens-switcher button[data-lens="geography"]').click();
  await shot(page, '13-geo-1280-en');
  await check('en 1280x720', { unlocatedLabel: 'Unlocated articles' });

  // 2. en 390x844
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.locator('#lens-switcher button[data-lens="geography"]').click();
  await shot(page, '13-geo-390-en');
  await check('en 390x844', { unlocatedLabel: 'Unlocated articles' });

  // 3. fi 390x844
  await setLang(page, 'fi');
  await ready(page);
  await page.locator('#lens-switcher button[data-lens="geography"]').click();
  await shot(page, '13-geo-390-fi');
  await check('fi 390x844', { unlocatedLabel: 'Paikantamattomat artikkelit' });

  expect(failures, 'Geography layout failures by UI language and viewport').toEqual([]);
});
