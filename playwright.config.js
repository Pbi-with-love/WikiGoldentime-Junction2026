import { defineConfig } from '@playwright/test';

const baseURL = process.env.BASE_URL || 'http://127.0.0.1:18322';

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: {
    timeout: 15_000,
  },
  outputDir: 'artifacts/e2e/test-results',
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/e2e/results.json' }],
  ],
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL,
    viewport: { width: 1280, height: 720 },
    browserName: 'chromium',
    actionTimeout: 15_000,
  },
});
