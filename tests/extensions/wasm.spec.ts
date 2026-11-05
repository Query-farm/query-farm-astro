import assert from 'node:assert/strict';
import type { Page } from '@playwright/test';
import { test, expect } from '../haybarn-functions/browser/fixtures';
import { examples } from './wasm-examples';
import { captureTerminal, terminalText, waitForPrompt, runSQL, requireLoadedExtension, runButton } from './wasm-helpers';
import { wasmPages, type WasmPage } from './wasm-pages';

const pages = wasmPages();
const runners = [...new Map(pages.map(({ extension, source }) => [`${extension}:${source}`, { extension, source }])).values()]
  .sort((a, b) => a.extension.localeCompare(b.extension) || a.source.localeCompare(b.source));

function examplePage(extension: string, source: string): WasmPage {
  const example = examples[extension];
  assert.ok(example, `Add a real SQL/result example for ${extension} in tests/extensions/wasm-examples.ts. It offers a browser runner.`);
  const candidates = pages.filter(page => page.extension === extension && page.source === source && page.sql.some(sql => example.sql.test(sql)));
  candidates.sort((a, b) => Number(!a.path.startsWith('/products/extensions/')) - Number(!b.path.startsWith('/products/extensions/')) || a.path.localeCompare(b.path));
  assert.ok(candidates.length, `The documented ${extension} smoke query is missing from the built pages. Update its test alongside the documentation.`);
  return candidates[0];
}

async function openExample(page: Page, extension: string, source = 'community') {
  const target = examplePage(extension, source);
  await captureTerminal(page);
  await page.goto(target.path);
  const pre = page.locator(target.selector).filter({ hasText: examples[extension].sql }).first();
  await expect(pre).toBeVisible();
  await runButton(pre).click();
  await waitForPrompt(page);
  return target;
}

test('every extension offering a browser runner has a documented execution check', () => {
  for (const { extension, source } of runners) examplePage(extension, source);
});

test('Cronjob keeps its SQL documentation without offering unsupported browser execution', async ({ page }) => {
  expect(pages.filter(page => page.extension === 'cronjob')).toEqual([]);
  for (const path of ['/products/extensions/cronjob/', '/products/extensions/cronjob/functions/category/scheduling/']) {
    await page.goto(path);
    await expect(page.getByText("Cronjob's scheduler needs background threads", { exact: false })).toBeVisible();
    await expect(page.locator('pre[data-language="sql"]').filter({ hasText: 'SELECT * FROM cron_jobs();' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy code', exact: true }).first()).toBeVisible();
    // Checking the island as well as buttons prevents a late hydration from
    // re-enabling Run after this assertion has already passed.
    await expect(page.locator('astro-island[component-url*="ExampleShellMounter"]')).toHaveCount(0);
    await expect(page.locator('.example-toolbar-run-button, .example-try-button')).toHaveCount(0);
  }
});

for (const { extension, source } of runners) {
  test(`${extension} from ${source}: Run via WASM loads the published extension and executes documented SQL`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const failedDownloads: string[] = [];
    const engineErrors: string[] = [];
    page.on('console', message => {
      // The WASM worker can emit engine errors with console.log, not .error.
      if (/Error:|Exception:|prefetch.*failed/.test(message.text())) engineErrors.push(message.text());
    });
    page.on('response', response => {
      if (response.url().includes('.duckdb_extension.wasm') && !response.ok()) failedDownloads.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (request.url().includes('.duckdb_extension.wasm')) failedDownloads.push(`${request.failure()?.errorText} ${request.url()}`);
    });
    try {
      await openExample(page, extension, source);
      await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');
      assert.deepEqual(failedDownloads, [], `${extension}: published WASM artifact downloads must succeed`);
      const output = await terminalText(page);
      assert.doesNotMatch(output, /may\s+not\s+have\s+a\s+WebAssembly\s+build|(?:Error|Exception):/, [output, ...engineErrors].join('\n'));
      assert.match(output, examples[extension].result, `${extension}: the real documentation query must return the expected result:\n${output}`);
      await requireLoadedExtension(page, extension);
    } finally {
      await info.attach('terminal', { body: await terminalText(page).catch(() => ''), contentType: 'text/plain' });
      await info.attach('artifact-failures', { body: failedDownloads.join('\n'), contentType: 'text/plain' });
      await info.attach('engine-errors', { body: engineErrors.join('\n'), contentType: 'text/plain' });
    }
  });
}

test('a missing extension is rejected even when ordinary SQL succeeds', async ({ page }) => {
  const blocked: string[] = [];
  await page.route('**/community/**/rapidfuzz.duckdb_extension.wasm', async route => {
    blocked.push(route.request().url());
    await route.fulfill({ status: 404, body: 'Missing build regression test', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  await openExample(page, 'rapidfuzz');
  expect(blocked.length).toBeGreaterThan(0);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'failed');
  const output = await runSQL(page, 'SELECT 42 AS ordinary_sql_still_works;');
  expect(output).toMatch(/│\s*42\s*│/);
  await expect(requireLoadedExtension(page, 'rapidfuzz')).rejects.toThrow('rapidfuzz must actually LOAD');
});
