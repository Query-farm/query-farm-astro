import { defineConfig } from '@playwright/test';

const previewURL = `http://127.0.0.1:${process.env.PLAYWRIGHT_PORT ?? 4323}`;

export default defineConfig({
  testDir: './tests',
  testMatch: ['haybarn-functions/browser/**/*.spec.ts', 'haybarn-extensions/**/*.spec.ts', 'extensions/**/*.spec.ts', 'vgi/**/*.spec.ts', 'search/**/*.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { baseURL: previewURL, reducedMotion: 'reduce', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx scripts/haybarn-functions/preview-test.mjs', url: previewURL, reuseExistingServer: !process.env.CI },
});
