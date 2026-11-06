import { test, expect } from './fixtures';
import { createCaptureBrowser } from '../../../scripts/haybarn-functions/capture-browser.mjs';
import { usageGuides } from '../../../src/haybarn-functions/data/usage-guides';

test('authored usage examples produce the published results and can run twice', async () => {
  const capture = await createCaptureBrowser();
  try {
    // One engine startup for the entire guide set, not one browser per example.
    for (const [name, guide] of Object.entries(usageGuides)) {
      await test.step(name, async () => {
        const results = await capture.page.evaluate(async ({ sql }) => {
          const modulePath = '/src/haybarn-functions/lib/engine.ts';
          const { createConnection, formatColumnValue } = await import(/* @vite-ignore */ modulePath);
          const { conn } = await createConnection();
          try {
            const results = [];
            for (let run = 0; run < 2; run++) {
              const table = await conn.query(sql);
              const columns = table.schema.fields.map((field: { name: string }) => field.name);
              const rows = Array.from({ length: table.numRows }, (_, index) => columns.map((_: string, col: number) => {
                const column = table.getChildAt(col);
                return column.get(index) === null ? null : formatColumnValue(column, index);
              }));
              results.push({ columns, rows });
            }
            return results;
          } finally { await conn.close(); }
        }, { sql: guide.sql });
        for (const result of results) expect(result, name).toEqual({ columns: guide.columns, rows: guide.rows });
      });
    }
  } finally { await capture.close(); }
});

test('category guides and expected results work without JavaScript on mobile', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 800 } });
  const page = await context.newPage();
  try {
    await page.goto('/products/haybarn/functions/category/json/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SQL JSON extraction and path functions');
    await expect(page.getByRole('region', { name: 'Expected query result' })).toContainText('apple');
    await page.getByRole('link', { name: 'Full json_extract_string() reference' }).click();
    await expect(page.locator('#usage')).toContainText('Expected result');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});

test('a category guide runs its example and links to a filtered catalog', async ({ page }) => {
  await page.goto('/products/haybarn/functions/category/json/');
  const example = page.locator('#example sql-playground');
  await example.locator('[data-run]').click();
  await expect(example.locator('.result-table-wrap')).toContainText('apple', { timeout: 30_000 });
  await page.locator('[data-category-catalog]').click();
  await expect(page).toHaveURL(/catalog\/\?category=json$/);
  await expect.poll(() => page.locator('[data-function-row]:visible').evaluateAll(rows => rows.length > 0 && rows.every(row => (row as HTMLElement).dataset.category === 'json'))).toBe(true);
});
