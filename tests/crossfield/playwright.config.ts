import { defineConfig } from '@playwright/test';
const port = Number(process.env.CROSSFIELD_PREVIEW_PORT || 4455);
const baseURL = `http://localhost:${port}`;
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.ts', timeout: 120_000,
  expect: { timeout: 10_000 }, workers: 1,
  outputDir: '../../.cache/crossfield-content-review/browser-results',
  use: { baseURL, browserName: 'webkit', reducedMotion: 'reduce', actionTimeout: 10_000, navigationTimeout: 20_000, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-webkit', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile-webkit', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
    { name: 'small-mobile-webkit', use: { viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  ],
  webServer: { command: `npm run dev -- --port ${port}`, url: baseURL, reuseExistingServer: !process.env.CI, cwd: '../..' },
});
