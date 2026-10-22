import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';

const dataRoot = new URL('../../src/data/extensions/', import.meta.url);
const entries = readdirSync(dataRoot).flatMap(slug => {
  try {
    const metadata = JSON.parse(readFileSync(new URL(`${slug}/augment/metadata.json`, dataRoot), 'utf8'));
    return metadata.entryPage ? [{ slug, metadata }] : [];
  } catch {
    return [];
  }
});

test('extension search matches tasks, preserves the URL, and recovers from no results', async ({ page }) => {
  await page.goto('/products/extensions/');
  const search = page.locator('#ext-filter');
  await search.fill('fuzzy matching');
  await expect(page.locator('.ext-item:visible a[href*="rapidfuzz"]').first()).toBeVisible();
  await expect(page).toHaveURL(/q=fuzzy\+matching/);
  await page.reload();
  await expect(search).toHaveValue('fuzzy matching');
  await search.fill('no-such-extension-zzzz');
  await expect(page.locator('#ext-empty')).toBeVisible();
  await page.locator('#ext-reset').click();
  await expect(page.locator('.ext-item:visible')).toHaveCount(entries.length);
  await expect(page).not.toHaveURL(/[?&]q=/);
});

test('native DuckDB 2.0 examples use Query.Farm while browser examples keep the pinned community runtime', async ({ page }) => {
  await page.goto('/products/extensions/rapidfuzz/');
  const example = page.locator('[data-entry-example-panel]');
  const browser = example.locator('[role="tabpanel"][data-tab="v1.5"]');
  const native = example.locator('[role="tabpanel"][data-tab="v2.0"]');
  await expect(browser).toBeVisible();
  await expect(browser).toContainText('INSTALL rapidfuzz FROM community;');
  await expect(browser).not.toContainText('CREATE EXTENSION REPOSITORY');
  await expect(browser.getByRole('button', { name: 'Run example in your browser' })).toBeVisible();
  await example.getByRole('tab', { name: 'DuckDB 2.0', exact: true }).click();
  await expect(native).toBeVisible();
  await expect(browser).toBeHidden();
  await expect(native).toContainText("WITH PREFIX 'https://duckdb-extensions.query.farm'");
  await expect(native).toContainText('LOAD rapidfuzz FROM query_farm;');
  await expect(native).toContainText('WITH names');
  await expect(native.locator('.example-toolbar-run-button')).toHaveCount(0);
  await page.reload();
  await expect(native).toBeVisible();
});

test('all extension entry pages retain introductions, complete examples, and release-specific compatibility on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  for (const { slug, metadata } of entries) {
    const compatibility = JSON.parse(readFileSync(new URL(`${slug}/generated/compatibility.json`, dataRoot), 'utf8'));
    await page.goto(`/products/extensions/${slug}/`);
    await page.evaluate(async () => { await document.fonts.ready; });
    await expect(page.locator('#overview .entry-note > p')).toHaveCount(metadata.entryPage.introduction.paragraphs.length);
    await expect(page.locator('[data-entry-example-panel]')).toHaveCount(metadata.quickStart.length);
    await expect(page.locator('#quick-start')).toContainText(`INSTALL ${metadata.name}`);
    const native = compatibility.compatibilityReleases.find((release: any) => release.distribution === 'duckdb');
    await expect(page.locator('#compatibility').getByText('DuckDB v2.0.0', { exact: true })).toHaveCount(native.platforms.length ? 1 : 0);
    await expect(page.locator('#compatibility')).toContainText('Browser examples use Haybarn-Wasm 1.5.6.');
    expect(await page.evaluate(() => document.documentElement.scrollWidth), slug).toBeLessThanOrEqual(321);
  }
});
