import { test as base, expect } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    const errors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    page.on('pageerror', (err) => {
      errors.push(`pageerror: ${err?.message || String(err)}`);
    });

    page.on('requestfailed', (req) => {
      const reason = req.failure()?.errorText || 'failed';
      errors.push(`requestfailed: ${req.method()} ${req.url()} (${reason})`);
    });

    page.on('response', (res) => {
      if (res.status() >= 400) {
        errors.push(`http ${res.status()}: ${res.url()}`);
      }
    });

    await use(page);

    await testInfo.attach('browser-errors', {
      body: JSON.stringify(errors, null, 2),
      contentType: 'application/json',
    });

    expect(
      errors,
      `Expected 0 console/page/network errors, found ${errors.length}:\n${errors.join('\n')}`,
    ).toEqual([]);
  },
});

export { expect };
