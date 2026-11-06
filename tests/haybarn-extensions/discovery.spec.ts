import { test, expect } from '@playwright/test';
import snapshot from '../../src/data/haybarn-extensions/catalog.generated.json' with { type: 'json' };
import { PAGE_SIZE } from '../../src/data/haybarn-extensions/pagination.mjs';

const root = '/products/haybarn/extensions';
const currentExtensions = snapshot.extensions.filter(extension => extension.availability.some(artifact => artifact.version === snapshot.latestVersion));
test('only current-release extensions are listed and Query Farm entries reuse their existing pages', async ({ page, request }) => {
  await page.goto(root);
  await expect(page.locator('[data-extension]:visible')).toHaveCount(PAGE_SIZE);
  await expect(page.locator('#extension-result-count')).toHaveText(`1–${PAGE_SIZE} of ${currentExtensions.length} extensions`);
  await expect(page.locator('#extension-release')).toHaveCount(0);
  await expect(page.locator('#extension-platform')).toHaveCount(0);
  const owners = [...new Set(currentExtensions.map(extension => extension.repo.github.split('/')[0].toLowerCase()))]
    .filter(owner => !['query-farm', 'query-farm-haybarn'].includes(owner)).sort((a, b) => a.localeCompare(b));
  expect(await page.locator('#extension-publisher option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', 'query-farm', ...owners]);
  const exported = await (await request.get(`${root}/catalog.json`)).json();
  expect(exported.extensions.map((extension: any) => extension.name).sort()).toEqual(currentExtensions.map(extension => extension.name).sort());
  expect(exported.releases.map((release: any) => release.version)).toEqual([snapshot.latestVersion]);
  expect([...new Set(exported.extensions.flatMap((extension: any) => extension.availability.map((artifact: any) => artifact.version)))]).toEqual([snapshot.latestVersion]);
  await page.locator('#extension-query').fill('rapidfuzz');
  await expect(page.locator('[data-extension="rapidfuzz"] h2 a')).toHaveAttribute('href', '/products/extensions/rapidfuzz');
  for (const name of snapshot.unavailable) await expect(page.locator(`[data-extension="${name}"]`)).toHaveCount(0);
});

test('Pagefind discovers extensions by task and captured function arguments', async ({ page }) => {
  await page.goto(root);
  const input = page.getByRole('searchbox', { name: 'What do you want to do?' });
  await input.fill('read Excel');
  await expect(page.locator('[data-extension="sheetreader"]')).toBeVisible();
  await expect(page.locator('[data-extension="crypto"]')).toBeHidden();
  await input.fill('coerce_to_string');
  await expect(page.locator('[data-extension="sheetreader"]')).toBeVisible();
  await input.fill('misspelled names');
  await expect(page.locator('[data-extension="rapidfuzz"]')).toBeVisible();
  // Verify the production index itself, so a fallback string match cannot
  // mask a missing or incorrectly scoped Pagefind catalog.
  const indexed = await page.evaluate(async () => {
    const asset = '/pagefind/pagefind.js';
    const engine = await import(/* @vite-ignore */ asset);
    const result = await engine.search('coerce_to_string', { filters: { kind: 'haybarn-extension' } });
    return {
      names: await Promise.all(result.results.map(async (item: any) => (await item.data()).meta.extension_slug)),
      count: (await engine.filters()).kind['haybarn-extension'],
    };
  });
  expect(indexed.names).toContain('sheetreader');
  expect(indexed.count).toBe(currentExtensions.length);
});

test('publisher pagination preserves the selection and removes legacy platform/release filters', async ({ page }) => {
  await page.goto(`${root}?release=1.5.4&platform=wasm_eh`);
  await expect(page).not.toHaveURL(/release=|platform=/);
  await expect(page.locator('#extension-result-count')).toHaveText(`1–${PAGE_SIZE} of ${currentExtensions.length} extensions`);
  await page.locator('#extension-publisher').selectOption('query-farm');
  const expected = currentExtensions.filter(extension => /^(query-farm|query-farm-haybarn)\//i.test(extension.repo.github));
  await expect(page.locator('[data-extension]:visible')).toHaveCount(Math.min(expected.length, PAGE_SIZE));
  await expect(page.locator('#extension-result-count')).toContainText(`of ${expected.length} extensions`);
  await expect(page.locator('[data-extension="gsheets"]')).toBeHidden();
  await page.getByRole('navigation', { name: 'Extension result pages' }).getByRole('link', { name: 'Next →' }).click();
  await expect(page).toHaveURL(/page\/2\/?\?publisher=query-farm/);
  await page.reload();
  await expect(page.locator('[data-extension]:visible')).toHaveCount(Math.min(expected.length - PAGE_SIZE, PAGE_SIZE));
  await expect(page.locator('#extension-result-count')).toContainText(`${PAGE_SIZE + 1}–${Math.min(expected.length, PAGE_SIZE * 2)} of ${expected.length}`);
  await expect(page.locator('#extension-publisher')).toHaveValue('query-farm');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-extension]:visible')).toHaveCount(PAGE_SIZE);
  await expect(page).not.toHaveURL(/\/page\/|publisher=/);
});

test('publisher facets filter by GitHub owner, count query matches, and can be removed independently', async ({ page }) => {
  await page.goto(`${root}?publisher=DataZooDE`);
  const publisher = page.locator('#extension-publisher');
  const dataZoo = currentExtensions.filter(extension => extension.repo.github.startsWith('DataZooDE/'));
  await expect(publisher).toHaveValue('datazoode');
  await expect(page).toHaveURL(/publisher=datazoode/);
  await expect(page.locator('[data-extension]')).toHaveCount(dataZoo.length);
  expect((await page.locator('[data-extension]').evaluateAll(entries => entries.map(entry => entry.getAttribute('data-extension')))).sort()).toEqual(dataZoo.map(entry => entry.name).sort());
  await expect(publisher.locator('option[value="datazoode"]')).toHaveText(`DataZooDE (${dataZoo.length})`);
  await publisher.selectOption('duckdb');
  const duckdb = currentExtensions.filter(extension => extension.repo.github.startsWith('duckdb/'));
  await expect(page.locator('[data-extension]')).toHaveCount(duckdb.length);
  expect((await page.locator('[data-extension]').evaluateAll(entries => entries.map(entry => entry.getAttribute('data-extension')))).sort()).toEqual(duckdb.map(entry => entry.name).sort());
  const queryFarm = currentExtensions.filter(extension => /^(query-farm|query-farm-haybarn)\//i.test(extension.repo.github));
  await expect(publisher.locator('option[value="query-farm"]')).toHaveText(`Query Farm (${queryFarm.length})`);
  await publisher.selectOption('query-farm');
  await expect(publisher.locator('option[value=""]')).toHaveText(`All publishers (${currentExtensions.length})`);
  await expect(page.locator('#extension-result-count')).toContainText(`of ${queryFarm.length} extensions`);
  await page.locator('#extension-query').fill('rapidfuzz');
  const entry = page.locator('[data-extension="rapidfuzz"]');
  await expect(entry).toBeVisible();
  await expect(entry.locator('.extension-glyph svg path')).not.toHaveCount(0);
  await expect(entry.locator('.release-label')).toHaveText(`Haybarn ${snapshot.latestVersion}`);
  await expect(entry.locator('.extension-topics a').first()).toHaveAttribute('href', /\/category\/.*\?publisher=query-farm&q=rapidfuzz/);
  await expect(publisher.locator('option[value="query-farm"]')).toHaveText('Query Farm (1)');
  await expect(publisher.locator('option[value="datazoode"]')).toHaveJSProperty('disabled', true);
  await page.getByRole('button', { name: 'Remove search filter' }).click();
  await expect(page.locator('#extension-result-count')).toContainText(`of ${queryFarm.length} extensions`);
  await expect(publisher).toHaveValue('query-farm');
  await page.getByRole('button', { name: 'Remove publisher filter' }).click();
  await expect(page.getByRole('group', { name: 'Active filters' })).toBeHidden();
  await expect(page.locator('#extension-result-count')).toHaveText(`1–${PAGE_SIZE} of ${currentExtensions.length} extensions`);
});

test('category pages and directory links work without JavaScript', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(root);
  const names: string[] = [];
  while (true) {
    const entries = await page.locator('[data-extension]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-extension')!));
    expect(entries.length).toBeLessThanOrEqual(PAGE_SIZE);
    names.push(...entries);
    const next = page.getByRole('navigation', { name: 'Extension result pages' }).getByRole('link', { name: 'Next →' });
    if (!await next.count()) break;
    await next.click();
  }
  expect(names.sort()).toEqual(currentExtensions.map(extension => extension.name).sort());
  expect(new Set(names).size).toBe(names.length);
  await page.getByRole('navigation', { name: 'Extension categories' }).getByRole('link', { name: /Files & formats/ }).click();
  await expect(page).toHaveURL(/category\/files/);
  await expect(page.locator('[data-extension="arrow"]')).toBeVisible();
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
  await expect(page.locator('button', { hasText: /Run example|Try it in your browser/ })).toHaveCount(0);
});

test('discovery and prototype pages fit a small screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 900 });
  for (const path of [root, `${root}/page/2`, `${root}/sheetreader`, `${root}/gsheets`]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    if (path === root) await expect(page.locator('[data-extension]').first()).toBeInViewport();
  }
});
