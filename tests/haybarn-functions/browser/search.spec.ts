import { test, expect } from './fixtures';

test('homepage search submits to full-text search and restores focus when closed', async ({ page }) => {
  await page.goto('/products/haybarn/functions/');
  const homeInput = page.getByRole('searchbox', { name: 'Search functions, arguments, and examples' });
  await homeInput.fill('name_list');
  await homeInput.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Search functions' });
  await expect(dialog.getByRole('searchbox')).toHaveValue('name_list');
  await expect(dialog.locator(`a[href="/products/haybarn/functions/regexp_extract/"]`)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(homeInput).toBeFocused();
  await homeInput.fill('');
  await homeInput.press('Enter');
  await expect(dialog.locator('#haybarn-search-results a')).toHaveCount(0);
  await expect(dialog.getByRole('status')).toHaveText('Search descriptions, arguments, SQL examples, and guides.');
});

test('full-text search finds arguments, example SQL and guide content with release filtering', async ({ page, request }) => {
  const searchRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('/pagefind/')) searchRequests.push(request.url()); });
  await page.goto('/products/haybarn/functions/');
  expect(searchRequests).toEqual([]);
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Search functions' });
  const input = dialog.getByRole('searchbox');
  await expect(input).toBeFocused();
  const manifest = await (await request.get('/products/haybarn/functions/api/v1/releases.json')).json();
  const indexed = await (await request.get('/products/haybarn/functions/search-manifest.json')).json();
  expect(indexed.functionCount).toBe(manifest.snapshots.reduce((count: number, snapshot: { functionCount: number }) => count + snapshot.functionCount, 0));

  await input.fill('name_list');
  await expect(dialog.locator(`a[href="/products/haybarn/functions/regexp_extract/"]`)).toBeVisible();
  await expect(dialog.locator('#haybarn-search-results mark').first()).toBeVisible();
  expect(await dialog.locator('#haybarn-search-results a').evaluateAll(links => links.every(link => !link.getAttribute('href')!.startsWith('/products/haybarn/functions/releases/duckdb-')))).toBe(true);

  await input.fill('abcde');
  await expect(dialog.locator(`a[href="/products/haybarn/functions/regexp_extract/"]`)).toBeVisible();
  await expect(dialog.locator('#haybarn-search-results')).toContainText('abcde');

  await input.fill('list_aggr sum');
  await expect(dialog.locator(`a[href="/products/haybarn/functions/list_sum/"]`)).toBeVisible();

  await input.fill('regexp_extract');
  await dialog.getByLabel('Include other releases').check();
  await expect(dialog.locator('a[href="/products/haybarn/functions/releases/duckdb-1.3.2/regexp_extract/"]')).toBeVisible();
  await dialog.getByLabel('Include other releases').uncheck();
  await expect(dialog.locator('a[href="/products/haybarn/functions/releases/duckdb-1.3.2/regexp_extract/"]')).toHaveCount(0);

  await dialog.getByRole('button', { name: 'Guides', exact: true }).click();
  await input.fill('Fetch a function index');
  await expect(dialog.locator('a[href="/products/haybarn/functions/agents/"]')).toBeVisible();

  await dialog.getByRole('button', { name: 'Functions', exact: true }).click();
  await input.fill('VARCHAR');
  await expect(dialog.locator('#haybarn-search-results a')).toHaveCount(8);
  await dialog.getByRole('button', { name: 'Show more results' }).click();
  await expect(dialog.locator('#haybarn-search-results a')).toHaveCount(16);

  // Quote the absent term so short SQL literals cannot match through prefix expansion.
  await input.fill('"zzzxqvjk937654"');
  await expect(dialog.getByRole('status')).toContainText('No results');
  await expect(dialog.locator('#haybarn-search-results a')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.header-search')).toBeFocused();
});

test('search works on mobile, keeps focus inside the dialog and opens results with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/haybarn/functions/releases/duckdb-1.4.4/date_trunc/');
  await page.locator('.header-search').click();
  const dialog = page.getByRole('dialog', { name: 'Search functions', exact: true });
  const input = dialog.getByRole('searchbox');
  await input.fill('regexp_extract');
  await expect(dialog.locator('a[href="/products/haybarn/functions/releases/duckdb-1.4.4/regexp_extract/"]')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await input.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.locator('#haybarn-search-results a').first()).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/products\/haybarn\/functions\/releases\/duckdb-1.4.4\/regexp_extract\//);
});

test('search reports index failures and can retry without navigating away', async ({ page }) => {
  await page.route('**/pagefind/**', route => route.abort());
  await page.goto('/products/haybarn/functions/');
  await page.locator('.header-search').click();
  const dialog = page.getByRole('dialog', { name: 'Search functions', exact: true });
  await dialog.getByRole('searchbox').fill('list_transform');
  await expect(dialog.getByRole('status')).toContainText('Search could not load');
  await page.unroute('**/pagefind/**');
  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.locator(`a[href="/products/haybarn/functions/list_transform/"]`)).toBeVisible();
});
