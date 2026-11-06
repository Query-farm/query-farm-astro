import { defineConfig } from '@playwright/test';
import baseConfig from './playwright.config';

// Keep new browser regressions in the deployment gate by default. Only the
// exhaustive documentation sweep belongs to the separate nightly workflow.
export default defineConfig(baseConfig, {
  testIgnore: ['**/extensions/all-examples.spec.ts'],
  globalTimeout: 8 * 60_000,
  maxFailures: 3,
});
