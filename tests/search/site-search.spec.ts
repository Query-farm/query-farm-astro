import { test, expect } from '@playwright/test';

test('settled site searches preserve the shared search analytics event', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const tracking = window as unknown as { searchEvents: unknown[][]; gtag: (...args: unknown[]) => void };
    tracking.searchEvents = [];
    tracking.gtag = (...args) => { tracking.searchEvents.push(args); };
  });
  await page.locator('#site-search-open').click();
  await page.locator('#site-search-input').fill('airport');
  await expect.poll(() => page.evaluate(() => (window as unknown as { searchEvents: unknown[][] }).searchEvents))
    .toContainEqual(['event', 'search', { search_term: 'airport', search_area: 'site', search_results: expect.any(Number) }]);
});

test('site search shows popular extensions with icons and ranks direct names before mentions', async ({ page, request }) => {
  const catalog = await (await request.get('/search/extensions.json')).json();
  expect(catalog.some((extension: { id: string }) => ['example', 'chsql', 'quackscale'].includes(extension.id))).toBe(false);
  await page.goto('/');
  await page.getByRole('button', { name: 'Search Query Farm' }).click();
  const dialog = page.locator('#site-search-modal');
  const results = dialog.locator('#site-search-results');
  const input = dialog.getByRole('searchbox');
  await expect(input).toBeFocused();
  await expect(dialog.getByRole('heading', { name: 'Popular extensions' })).toBeVisible();
  await expect(results.locator('a')).toHaveCount(6);
  const mostUsed = [...catalog].sort((a, b) => b.usageCount - a.usageCount)[0];
  await expect(results.locator('a').first()).toHaveAttribute('href', mostUsed.url);
  await expect(results.locator('a').first().locator('svg')).toBeVisible();
  await expect(results.locator('a').first()).toContainText('loads');

  for (const [query, slug] of [['airport', 'airport'], ['http_client', 'http_client'], ['dataSKEtches', 'datasketches'], ['red', 'redis']]) {
    await input.fill(query);
    await expect(results.locator('a').first()).toHaveAttribute('href', `/products/extensions/${slug}/`);
    await expect(results).toHaveAttribute('aria-busy', 'false');
    await expect(results.locator('a').first()).toHaveAttribute('data-kind', 'Extension');
    await expect(results.locator(`a[href="/products/extensions/${slug}/"]`)).toHaveCount(1);
  }
  await input.fill('airport');
  await expect(results.locator('a').first()).toHaveAttribute('href', '/products/extensions/airport/');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  await page.screenshot({ path: 'test-results/site-search-desktop.png' });

  // Exercise the actual HTML index as well as the extension catalog. Without
  // a body marker on all layouts, Pagefind silently loses these pages.
  await input.fill('Functionally Testing');
  await expect(results.locator('a[href="/blog/testing-duckdb-wasm-extensions/"]')).toHaveAttribute('data-kind', 'Blog');
  await input.fill('result caching');
  await expect(results.locator('a[data-kind="Documentation"]').first()).toBeVisible();

  // Quoting disables Pagefind's prefix expansion into short SQL literals.
  await input.fill('"zzzxqvjk937654"');
  await expect(dialog.getByRole('status')).toContainText('No results');
  await expect(results.locator('a')).toHaveCount(0);
  await input.clear();
  await expect(dialog.getByRole('heading', { name: 'Popular extensions' })).toBeVisible();
});

test('function search remains opt-in and labels results with their parent extension', async ({ page }) => {
  await page.goto('/');
  await page.locator('#site-search-open').click();
  const dialog = page.locator('#site-search-modal');
  await dialog.getByRole('searchbox').fill('http_get');
  await expect(dialog.locator('#site-search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.locator('a[data-kind="Function"]')).toHaveCount(0);
  await dialog.getByLabel('Also search function names').check();
  const result = dialog.locator('a[data-kind="Function"]').filter({ hasText: 'http_get()' }).first();
  await expect(result).toBeVisible();
  await expect(result).toContainText('HTTP Client');
  await expect(result.locator('svg')).toBeVisible();
});

test('mobile search supports focus trapping, arrow keys, Enter, and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const dialog = page.locator('#site-search-modal');
  const input = dialog.getByRole('searchbox');
  await input.fill('airport');
  const first = dialog.locator('#site-search-results a').first();
  await expect(first).toHaveAttribute('href', '/products/extensions/airport/');
  await expect(dialog.locator('#site-search-results')).toHaveAttribute('aria-busy', 'false');
  expect(await dialog.evaluate(element => element.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/site-search-mobile.png' });
  await input.press('Shift+Tab');
  await expect(dialog.getByLabel('Also search function names')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(input).toBeFocused();
  await input.press('ArrowDown');
  await expect(first).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('#site-search-open')).toBeFocused();
  await page.locator('#site-search-open').click();
  await expect(first).toHaveAttribute('href', '/products/extensions/airport/');
  await expect(dialog.locator('#site-search-results')).toHaveAttribute('aria-busy', 'false');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/products\/extensions\/airport\/$/);
});

test('extension navigation still works when the full-text index is unavailable', async ({ page }) => {
  await page.route('**/pagefind/**', route => route.abort());
  await page.goto('/');
  await page.locator('#site-search-open').click();
  const dialog = page.locator('#site-search-modal');
  await dialog.getByRole('searchbox').fill('redis');
  await expect(dialog.locator('#site-search-results a').first()).toHaveAttribute('href', '/products/extensions/redis/');
  await expect(dialog.getByRole('status')).toContainText('Showing extension matches');
});

test('full-text results preserve the extension result selected with the keyboard', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/pagefind/pagefind.js', async route => {
    await pending;
    await route.continue();
  });
  await page.goto('/');
  await page.locator('#site-search-open').click();
  const loading = page.waitForRequest('**/pagefind/pagefind.js');
  await page.locator('#site-search-input').fill('airport');
  await loading;
  const airport = page.locator('#site-search-results a[href="/products/extensions/airport/"]');
  await page.locator('#site-search-input').press('ArrowDown');
  await expect(airport).toBeFocused();
  release();
  await expect(page.locator('#site-search-results')).toHaveAttribute('aria-busy', 'false');
  await expect(airport).toBeFocused();
});

test('an older full-text response cannot replace a new query or the popular shortcuts', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/pagefind/pagefind.js', async route => {
    await pending;
    await route.continue();
  });
  await page.goto('/');
  await page.locator('#site-search-open').click();
  const dialog = page.locator('#site-search-modal');
  const input = dialog.getByRole('searchbox');
  const loading = page.waitForRequest('**/pagefind/pagefind.js');
  await input.fill('airport');
  await loading;
  await input.fill('redis');
  await expect(dialog.locator('#site-search-results a').first()).toHaveAttribute('href', '/products/extensions/redis/');
  await input.clear();
  await expect(dialog.getByRole('heading', { name: 'Popular extensions' })).toBeVisible();
  const loaded = page.waitForResponse('**/pagefind/pagefind.js');
  release();
  await loaded;
  await expect(dialog.getByRole('heading', { name: 'Popular extensions' })).toBeVisible();
  await expect(dialog.locator('#site-search-results a')).toHaveCount(6);
});
