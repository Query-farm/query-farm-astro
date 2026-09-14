import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: ['haybarn-functions/browser/**/*.spec.ts', 'haybarn-extensions/**/*.spec.ts'],
  timeout: 90_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4323', viewport: { width: 1440, height: 1050 }, trace: 'retain-on-failure' },
  webServer: { command: 'node --import tsx scripts/haybarn-functions/preview-test.mjs', url: 'http://127.0.0.1:4323', reuseExistingServer: !process.env.CI },
});
