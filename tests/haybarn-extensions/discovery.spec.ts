import { test, expect } from '@playwright/test';
import snapshot from '../../src/data/haybarn-extensions/catalog.generated.json' with { type: 'json' };

const root = '/products/haybarn/extensions';
const currentExtensions = snapshot.extensions.filter(extension => extension.availability.some(artifact => artifact.version === snapshot.latestVersion));
test('only current-release extensions are listed and Query Farm entries reuse their existing pages', async ({ page, request }) => {
  await page.goto(root);
  await expect(page.locator('[data-extension]:visible')).toHaveCount(currentExtensions.length);
  await expect(page.locator('#extension-release')).toHaveCount(0);
  const exported = await (await request.get(`${root}/catalog.json`)).json();
  expect(exported.extensions.map((extension: any) => extension.name).sort()).toEqual(currentExtensions.map(extension => extension.name).sort());
  expect(exported.releases.map((release: any) => release.version)).toEqual([snapshot.latestVersion]);
  expect([...new Set(exported.extensions.flatMap((extension: any) => extension.availability.map((artifact: any) => artifact.version)))]).toEqual([snapshot.latestVersion]);
  await expect(page.locator('[data-extension="rapidfuzz"] h2 a')).toHaveAttribute('href', '/products/extensions/rapidfuzz');
  for (const name of snapshot.unavailable) await expect(page.locator(`[data-extension="${name}"]`)).toHaveCount(0);
});

test('Pagefind discovers extensions by task and function name', async ({ page }) => {
  await page.goto(root);
  const input = page.getByRole('searchbox', { name: 'What do you want to do?' });
  await input.fill('read Excel');
  await expect(page.locator('[data-extension="sheetreader"]')).toBeVisible();
  await expect(page.locator('[data-extension="crypto"]')).toBeHidden();
  await input.fill('read_gsheet');
  await expect(page.locator('[data-extension="gsheets"]')).toBeVisible();
  await expect(page.locator('[data-extension="sheetreader"]')).toBeHidden();
  await input.fill('misspelled names');
  await expect(page.locator('[data-extension="rapidfuzz"]')).toBeVisible();
  // Verify the production index itself, so a fallback string match cannot
  // mask a missing or incorrectly scoped Pagefind catalog.
  const indexed = await page.evaluate(async () => {
    const asset = '/pagefind/pagefind.js';
    const engine = await import(/* @vite-ignore */ asset);
    const result = await engine.search('read_gsheet', { filters: { kind: 'haybarn-extension' } });
    return {
      names: await Promise.all(result.results.map(async (item: any) => (await item.data()).meta.extension_slug)),
      count: (await engine.filters()).kind['haybarn-extension'],
    };
  });
  expect(indexed.names).toContain('gsheets');
  expect(indexed.count).toBe(currentExtensions.length);
});

test('platform filters use the current release even with an older release in the URL', async ({ page }) => {
  await page.goto(`${root}?release=1.5.4`);
  await expect(page).not.toHaveURL(/release=/);
  const version = snapshot.latestVersion, platform = 'wasm_eh';
  await page.locator('#extension-platform').selectOption(platform);
  const expected = currentExtensions.filter(extension => extension.availability.some(artifact => artifact.version === version && artifact.platform === platform));
  await expect(page.locator('[data-extension]:visible')).toHaveCount(expected.length);
  await expect(page.locator('[data-extension="gsheets"]')).toBeHidden();
  await page.reload();
  await expect(page.locator('[data-extension]:visible')).toHaveCount(expected.length);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-extension]:visible')).toHaveCount(currentExtensions.length);
});

test('category pages and directory links work without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4323${root}`);
  await expect(page.locator('[data-extension]:visible')).toHaveCount(currentExtensions.length);
  await page.getByRole('navigation', { name: 'Extension categories' }).getByRole('link', { name: /Files & formats/ }).click();
  await expect(page).toHaveURL(/category\/files/);
  await expect(page.locator('[data-extension="sheetreader"]')).toBeVisible();
  await expect(page.locator('[data-extension="rapidfuzz"]')).toBeHidden();
  await context.close();
});

test('prototype references render captured options, developer explanations, and working links', async ({ page, request }) => {
  await page.goto(`${root}/sheetreader`);
  await expect(page.locator('#sheetreader')).toContainText('coerce_to_string');
  await expect(page.locator('#sheetreader')).toContainText('sheet_index');
  await expect(page.locator('#sheetreader')).toContainText('VARCHAR');
  await expect(page.locator('#examples')).toContainText('540');
  const workbook = await request.get('/products/haybarn/extensions/examples/sales.xlsx');
  expect(workbook.ok()).toBe(true);
  expect((await workbook.body()).subarray(0, 2).toString()).toBe('PK');
  await page.goto(`${root}/gsheets`);
  await expect(page.locator('#read_gsheet')).toContainText('header');
  await expect(page.locator('#read_gsheet')).not.toContainText('headers');
  await expect(page.locator('#authentication')).toContainText('oauth');
  await expect(page.locator('#write')).toContainText('FORMAT gsheet');
  await expect(page.locator('button', { hasText: /Run via WASM|Try it in your browser/ })).toHaveCount(0);
});

test('discovery and prototype pages fit a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  for (const path of [root, `${root}/sheetreader`, `${root}/gsheets`]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  }
});
