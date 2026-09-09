import { test, expect } from './fixtures';
import { defaultSnapshotId, wasmVersion } from '../../../src/haybarn-functions/data/haybarn-release.mjs';

const release = defaultSnapshotId;
test('the pinned published release is the default and formerly incomplete examples run with their own data', async ({ page, request }) => {
  const manifest = await (await request.get('/products/haybarn/functions/api/v1/releases.json')).json();
  expect(manifest.defaultSnapshot).toBe(release);
  expect(manifest.browserRuntime.packageVersion).toBe(wasmVersion);
  expect(manifest.browserRuntime.matchesDocumentationSnapshot).toBe(true);
  for (const [name, result] of [['sum', '30'], ['read_csv', 'apples'], ['json_group_object', 'pears'], ['enum_code', '2'], ['get_type', 'VARCHAR']]) {
    await page.goto(`/products/haybarn/functions/${name}/`);
    const example = page.locator('#examples sql-playground');
    await expect(example).toBeVisible();
    await example.getByRole('button', { name: /Run query/ }).click();
    await expect(example.locator('.result-table-wrap tbody')).toContainText(result, { timeout: 60_000 });
    await expect(example).not.toHaveClass(/has-error/);
    await expect(example.locator('.wasm-pin')).toHaveText(wasmVersion);
  }
});

test('DuckDB reading links and larger rewrites have distinct presentation', async ({ page }) => {
  await page.goto(`/products/haybarn/functions/strftime/`);
  await expect(page.locator('#duckdb-docs').getByRole('link', { name: /Date Format Functions/ })).toHaveAttribute('href', /duckdb.org\/docs\/current\/sql\/functions\/dateformat/);
  await expect(page.locator('#other-engines > .translation').first()).toContainText('PostgreSQL');
  await page.goto(`/products/haybarn/functions/abs/`);
  await expect(page.locator('#other-engines > .translation')).toHaveCount(0);
  const rewrites = page.locator('.translation-rewrites');
  await expect(rewrites.locator('.translation')).not.toBeVisible();
  await rewrites.locator('summary').click();
  await expect(rewrites).toContainText('one part of a larger SQL translation');
  await expect(rewrites).toContainText('BITMAP_BIT_POSITION');
  await page.goto(`/products/haybarn/functions/sleep_ms/`);
  await expect(page.locator('#examples sql-playground')).toHaveCount(0);
  await expect(page.locator('#catalog-examples')).toContainText(/sleep_ms\s*\(100\)/);
});
