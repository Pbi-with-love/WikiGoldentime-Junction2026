import { test, expect } from './fixtures.js';
import { ready, setLang, shot } from './helpers.js';

test('hero-ask', async ({ page }) => {
  // 1. English UI
  await ready(page);
  await page.locator('.prompt-chip[data-action="ask"]').click();

  const askPanel = page.locator('#ask-panel');
  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText(/Based on .+ Wikipedia/);
  await expect(askPanel).toContainText(/This answer changed [1-9]\d* times?/);

  const enCard = askPanel.getByRole('link', { name: 'oldid=1862876', exact: true }).last().locator('xpath=../..');
  await expect(enCard).toBeVisible();
  await expect(enCard.getByRole('button')).toBeVisible();
  await expect(enCard).toContainText('Edited by Whiskey~fiwiki on 7 Nov 2006');
  await shot(page, '06-hero-en');

  // 2. Swedish UI
  await setLang(page, 'sv');
  await ready(page);
  await page.locator('.prompt-chip[data-action="ask"]').click();

  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText(/Maskinöversatt från|Baserat på/);
  await expect(askPanel).toContainText(/Detta svar ändrades [1-9]\d* gång(er)?/);

  const svCard = askPanel.getByRole('link', { name: 'oldid=1862876', exact: true }).last().locator('xpath=../..');
  await expect(svCard).toBeVisible();
  await expect(svCard.getByRole('button')).toBeVisible();
  await expect(svCard).toContainText('Whiskey~fiwiki');
  await expect(svCard).toContainText('7 nov. 2006');
  await shot(page, '06-hero-sv');

  // 3. Finnish UI
  await setLang(page, 'fi');
  await ready(page);
  await page.locator('.prompt-chip[data-action="ask"]').click();

  await expect(askPanel).toBeVisible();
  await expect(askPanel).toContainText(/Perustuu/);
  await expect(askPanel).toContainText(/Tämä vastaus muuttui [1-9]\d* kerta(a)?|1 kerran/);

  const fiCard = askPanel.getByRole('link', { name: 'oldid=1862876', exact: true }).last().locator('xpath=../..');
  await expect(fiCard).toBeVisible();
  await expect(fiCard.getByRole('button')).toBeVisible();
  await expect(fiCard).toContainText('Whiskey~fiwiki');
  await expect(fiCard).toContainText('7.11.2006');
  await shot(page, '06-hero-fi');
});

test('hero-2006-diff', async ({ page }) => {
  await ready(page);
  await page.locator('.prompt-chip[data-action="ask"]').click();

  const askPanel = page.locator('#ask-panel');
  await expect(askPanel).toBeVisible();

  const card2006 = askPanel.getByRole('link', { name: 'oldid=1862876', exact: true }).last().locator('xpath=../..');
  await expect(card2006).toBeVisible();
  await card2006.getByRole('button').click();

  await expect(askPanel).toContainText('12. maaliskuuta');
  await expect(askPanel).toContainText('Word diff against today');

  const diffMarks = askPanel.locator('ins, del');
  await expect(diffMarks.first()).toBeVisible();
  expect(await diffMarks.count()).toBeGreaterThanOrEqual(1);

  await shot(page, '07-hero-2006-diff');
});
