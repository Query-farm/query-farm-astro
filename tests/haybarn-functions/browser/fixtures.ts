import { test as base, expect } from '@playwright/test';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { wasmVersion } from '../../../src/haybarn-functions/data/haybarn-release.mjs';

// Run the real pinned engine without relying on CDN availability in CI.
// Only transport is local; SQL execution and browser workers are unchanged.
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(`https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/dist/*`, async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      if (!/^duckdb-base\.wasm$|^duckdb-browser-base\.worker\.js$/.test(name)) return route.abort();
      await route.fulfill({
        body: await readFile(`node_modules/@haybarn/haybarn-wasm/dist/${name}`),
        contentType: name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
        headers: { 'Access-Control-Allow-Origin': '*' },
      });
    });
    const engineVersion = wasmVersion.split('-')[0];
    await page.route(`https://haybarn-extensions.query.farm/core/v${engineVersion}/wasm_eh/*.wasm`, async route => {
      const name = new URL(route.request().url()).pathname.split('/').pop()!;
      if (!/^[a-z0-9_]+\.duckdb_extension\.wasm$/.test(name)) return route.abort();
      const directory = `.cache/haybarn-browser-extensions/${wasmVersion}`;
      const path = `${directory}/${name}`;
      let body: Buffer;
      try { body = await readFile(path); }
      catch (error: any) {
        if (error.code !== 'ENOENT') throw error;
        const response = await fetch(route.request().url(), { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Core extension download failed: ${response.status} ${name}`);
        body = Buffer.from(await response.arrayBuffer());
        if (!body.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error(`Invalid WASM extension: ${name}`);
        await mkdir(directory, { recursive: true });
        // Different browser workers can fetch the same uncached artifact.
        const temporary = `${path}.${randomUUID()}.tmp`;
        await writeFile(temporary, body);
        await rename(temporary, path);
      }
      await route.fulfill({ body, contentType: 'application/wasm', headers: { 'Access-Control-Allow-Origin': '*' } });
    });
    await use(page);
  },
});
export { expect };
