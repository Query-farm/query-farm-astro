import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { wasmVersion } from '../../../src/haybarn-functions/data/haybarn-release.mjs';

// Run the real pinned engine without relying on CDN availability in CI.
// Only transport is local; SQL execution and browser workers are unchanged.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(`https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/dist/*`, async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      if (!/^duckdb-(?:eh|mvp)\.wasm$|^duckdb-browser-(?:eh|mvp)\.worker\.js$/.test(name)) return route.abort();
      await route.fulfill({
        body: await readFile(`node_modules/@haybarn/haybarn-wasm/dist/${name}`),
        contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });
    await use(page);
  },
});
export { expect };
