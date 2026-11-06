import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'vgi/agent-quickstart.spec.ts',
  timeout: 45_000,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4347', reducedMotion: 'reduce', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4347', url: 'http://127.0.0.1:4347', reuseExistingServer: !process.env.CI },
});
