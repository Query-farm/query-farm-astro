import { test, expect } from './fixtures';
import { defaultSnapshotId } from '../../../src/haybarn-functions/data/haybarn-release.mjs';

const comparison = '/products/haybarn/functions/compare/duckdb-1.4.4/duckdb-1.5.5/';

test('function changes default to Haybarn and display the same differences as the exported comparison', async ({ page, request }) => {
  await page.goto('/products/haybarn/function-changes/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Function changes');
  await expect(page.locator('#compare-to')).toHaveValue(defaultSnapshotId);
  await expect(page.locator('.header-links a[href="/products/haybarn/function-changes/"]')).toHaveCount(0);
  await expect(page.locator('#sidebar').getByRole('link', { name: 'Function changes' })).toBeVisible();
  await expect(page.locator('.release-charts, .snapshot-grid')).toHaveCount(0);
  const from = await page.locator('#compare-from').inputValue();
  const diff = await (await request.get(`/products/haybarn/functions/api/v1/compare/${from}/${defaultSnapshotId}.json`)).json();
  for (const group of ['added', 'removed', 'changed']) {
    const displayed = await page.locator(`#${group} [data-function-change]`).evaluateAll(rows => rows.map(row => (row as HTMLElement).dataset.name).sort());
    expect(displayed).toEqual(diff[group].map((fn: { name: string }) => fn.name).sort());
  }
  await expect(page.locator('.comparison-context')).toContainText('do not establish when a function was introduced or removed');
  await page.locator('.comparison-catalogs a').last().click();
  await expect(page).toHaveURL(`/products/haybarn/functions/catalog/`);
});

test('function changes filter by name, type and category, preserve links and recover from no matches', async ({ page }) => {
  await page.goto(comparison);
  await page.getByLabel('Find a function').fill('struct_keys');
  const row = page.locator('[data-name="struct_keys"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.change-description')).toHaveText('Returns the field names of a STRUCT as a list');
  await page.getByRole('combobox', { name: 'Category', exact: true }).selectOption('nested');
  await expect(page.locator('[data-function-change]:visible')).toHaveCount(1);
  await expect(page).toHaveURL(`${comparison}?q=struct_keys&category=nested`);
  await page.reload();
  await expect(page.getByLabel('Find a function')).toHaveValue('struct_keys');
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('nested');
  await row.getByRole('link', { name: 'Examples' }).click();
  await expect(page).toHaveURL('/products/haybarn/functions/releases/duckdb-1.5.5/struct_keys/#examples');
  await expect(page.locator('#examples')).toBeVisible();
  await page.goBack();
  await page.getByLabel('Find a function').fill('nothing_matches_this_function');
  await expect(page.getByRole('heading', { name: 'No matching function changes.' })).toBeVisible();
  await expect(page.locator('[data-change-group]:visible')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('Find a function')).toBeFocused();
  await expect(page).toHaveURL(comparison);
  await expect(page.locator('[data-function-change]:visible')).toHaveCount(56);
  await page.getByLabel('Find a function').fill('TIMESTAMP WITH TIME ZONE');
  await expect(page.locator('[data-name="strftime"]')).toBeVisible();
});

test('signature changes show both forms and function kinds, with readable mobile layouts', async ({ page }) => {
  await page.goto(`${comparison}?q=list_intersect&category=lists`);
  const change = page.locator('[data-name="list_intersect"]');
  await expect(change.locator('.before')).toContainText('DuckDB 1.4.4');
  await expect(change.locator('.before .kind-badge')).toHaveText('Macro');
  await expect(change.locator('.before .signature-box')).toContainText('list_intersect(l1: unknown, l2: unknown)');
  await expect(change.locator('.after .kind-badge')).toHaveText('Scalar');
  await expect(change.locator('.after .signature-box')).toContainText('list_intersect(list1: T[], list2: T[]) → T[]');
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(change.locator('.before .signature-box')).toBeVisible();
    await expect(change.locator('.after .signature-box')).toBeVisible();
  }
  await page.goto(`${comparison}?q=strftime`);
  const strftime = page.locator('[data-name="strftime"]');
  await expect(strftime.locator('.before')).toHaveCount(0);
  await expect(strftime.locator('.after h4')).toContainText('Additional overloads');
  await expect(strftime.locator('.after .signature-box')).toContainText('format: TIMESTAMP WITH TIME ZONE');
  // Keep the user's function search when choosing another comparison.
  await page.locator('#compare-to').selectOption(defaultSnapshotId);
  await page.getByRole('button', { name: /Compare/ }).click();
  await expect(page).toHaveURL(`/products/haybarn/functions/compare/duckdb-1.4.4/${defaultSnapshotId}/?q=strftime`);
  await expect(page.getByLabel('Find a function')).toHaveValue('strftime');
});

test('comparison content and reference links remain available without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4323${comparison}`);
  await expect(page.locator('.change-filters')).toBeHidden();
  await expect(page.locator('[data-name="list_intersect"] .before .signature-box')).toBeVisible();
  await expect(page.locator('[data-name="list_intersect"] .after .signature-box')).toBeVisible();
  await page.locator('[data-name="struct_keys"] h3 a').click();
  await expect(page).toHaveURL('/products/haybarn/functions/releases/duckdb-1.5.5/struct_keys/');
  await context.close();
});
