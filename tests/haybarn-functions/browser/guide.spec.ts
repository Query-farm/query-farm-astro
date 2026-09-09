import { test, expect } from './fixtures';
import { defaultSnapshotId } from '../../../src/haybarn-functions/data/haybarn-release.mjs';
const catalog = `/products/haybarn/functions/catalog/`;
const reference = `/products/haybarn/functions/`;

test('homepage is readable and loads WASM only after Run', async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on('request', request => { if (request.url().includes('.wasm')) wasmRequests.push(request.url()); });
  await page.goto('/products/haybarn/functions/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Haybarn SQL functions');
  expect(wasmRequests).toEqual([]);
  await page.getByRole('button', { name: /Run query/ }).click();
  await expect(page.getByRole('tabpanel', { name: 'Transform a list' }).locator('.result-table-wrap tbody')).toContainText('14.4', { timeout: 60_000 });
  expect(wasmRequests.length).toBeGreaterThan(0);
  await page.screenshot({ path: 'test-results/home-desktop.png', fullPage: true });
});

test('homepage examples retain edits, run independently, and link to their functions', async ({ page }) => {
  await page.goto('/products/haybarn/functions/');
  const list = page.getByRole('tabpanel', { name: 'Transform a list' });
  await list.locator('textarea').fill('SELECT list_transform([10], lambda price: price * 2) AS prices;');
  const picker = page.getByRole('tablist', { name: 'Choose an example' });
  await picker.getByRole('tab', { name: 'Transform a list' }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(picker.getByRole('tab', { name: 'Clean up text' })).toBeFocused();
  const text = page.getByRole('tabpanel', { name: 'Clean up text' });
  await expect(text).toBeVisible();
  await text.getByRole('button', { name: /Run query/ }).click();
  await expect(text.locator('.result-table-wrap tbody')).toContainText('summer-harvest-2026', { timeout: 60_000 });
  await expect(text.getByRole('link', { name: 'regexp_replace()' })).toHaveAttribute('href', `${reference}regexp_replace/`);

  await picker.getByRole('tab', { name: 'Transform a list' }).click();
  await expect(list.locator('textarea')).toHaveValue('SELECT list_transform([10], lambda price: price * 2) AS prices;');
  await list.getByRole('button', { name: /Run query/ }).click();
  await expect(list.locator('.result-table-wrap tbody')).toContainText('[20]');
  await list.getByRole('button', { name: 'Reset SQL' }).click();
  await expect(list.locator('textarea')).toHaveValue(/\[12, 24, 36\]/);
  // The active example can also be linked directly, including on mobile.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/products/haybarn/functions/#example-bucket-dates');
  const dates = page.getByRole('tabpanel', { name: 'Group dates by month' });
  await expect(dates).toBeVisible();
  await dates.getByRole('button', { name: /Run query/ }).click();
  await expect(dates.locator('.result-table-wrap tbody')).toContainText('205', { timeout: 60_000 });
  await picker.getByRole('tab', { name: 'Group dates by month' }).focus();
  await page.keyboard.press('ArrowRight');
  const json = page.getByRole('tabpanel', { name: 'Read a JSON field' });
  await expect(json).toBeVisible();
  await json.getByRole('button', { name: /Run query/ }).click();
  await expect(json.locator('.result-table-wrap tbody')).toContainText('Willow Creek');
});

test('search, category filters, empty state and release navigation work', async ({ page }) => {
  await page.goto(`${catalog}?q=list_transform`);
  await expect(page.locator('[data-function-row]:visible').first()).toHaveAttribute('data-name', 'list_transform');
  await page.getByRole('searchbox').fill('this_function_does_not_exist');
  await expect(page.getByRole('heading', { name: 'No functions found.' })).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await page.locator('.category-nav[href$="?category=json"]').click();
  await expect(page.locator('#result-count')).toContainText('functions');
  expect(await page.locator('[data-function-row]:visible').evaluateAll(rows => rows.every(row => (row as HTMLElement).dataset.category === 'json'))).toBe(true);
  await expect(page.getByLabel('Documentation snapshot')).toHaveCount(0);
  await page.locator('#sidebar').getByRole('link', { name: 'Function changes' }).click();
  await page.locator('#compare-from').selectOption('duckdb-1.4.4');
  await page.getByRole('button', { name: /Compare/ }).click();
  await page.locator('.comparison-catalogs').getByRole('link', { name: 'DuckDB 1.4.4' }).click();
  await expect(page).toHaveURL(/duckdb-1.4.4/);
});

test('all overloads are visible, directly linked, and retained across releases', async ({ page, request }) => {
  await page.goto(`${reference}regexp_extract/`);
  await expect(page.locator('#overload-select')).toHaveCount(0);
  await expect(page.locator('[data-overload]:visible')).toHaveCount(5);
  expect(await page.locator('#signatures').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#examples')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  expect(await page.locator('#more-examples').evaluate(element => Boolean(element.compareDocumentPosition(document.querySelector('#availability')!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  const last = page.locator('[data-overload]').last();
  const id = await last.getAttribute('id');
  await last.getByRole('link').click();
  await expect(page).toHaveURL(new RegExp(`#${id}$`));
  await expect(page.locator('.signature-group').filter({ hasText: 'name_list' }).first().locator('[data-catalog-description]')).toContainText('capturing groups as a struct');
  await expect(page.locator('[data-copy-signature]')).toHaveCount(0);
  await expect(page.locator('.function-heading .kind-icon')).toHaveCount(2);
  const manifest = await (await request.get('/products/haybarn/functions/api/v1/releases.json')).json();
  const currentRelease = manifest.snapshots.find((snapshot: { id: string }) => snapshot.id === defaultSnapshotId);
  const releaseLine = currentRelease.engineVersion.match(/^v?(\d+\.\d+)/)[1];
  await expect(page.locator('.release-badge-haybarn').first()).toHaveText(`Haybarn ${releaseLine}`);
  const badges = await page.locator('.release-badge').allTextContents();
  expect(new Set(badges).size).toBe(badges.length);
  await expect(page.getByRole('heading', { name: 'Across the releases.' })).toHaveCount(0);
  await expect(page.locator('.release-badges').getByRole('link', { name: 'DuckDB 1.4' })).toHaveAttribute('title', 'Observed in DuckDB 1.4.4');
  await page.locator('.release-badges').getByRole('link', { name: 'DuckDB 1.4' }).click();
  await expect(page).toHaveURL(/duckdb-1.4.4\/regexp_extract/);
  await page.screenshot({ path: 'test-results/function-desktop.png', fullPage: true });
});

test('a function with 92 overloads exposes every row without filler argument notes', async ({ page }) => {
  await page.goto(`${reference}arg_max/`);
  await expect(page.locator('[data-overload]:visible')).toHaveCount(92);
  await expect(page.getByText('The engine provides the name and types above, but no argument-level explanation.')).toHaveCount(0);
});

test('agents can discover JSON and Markdown without visible export controls', async ({ page, request }) => {
  const discovery = await request.get('/products/haybarn/functions/llms.txt');
  expect(await discovery.text()).toContain('/products/haybarn/functions/api/v1/releases.json');
  const manifest = await (await request.get('/products/haybarn/functions/api/v1/releases.json')).json();
  const snapshot = manifest.snapshots.find((item: { id: string }) => item.id === manifest.defaultSnapshot);
  const index = await (await request.get(snapshot.index)).json();
  const fn = index.functions.find((item: { name: string }) => item.name === 'date_trunc');
  const json = await (await request.get(fn.links.json)).json();
  expect(json.overloads).toHaveLength(4);
  expect(json.overloads[0].catalog.function_name).toBe('date_trunc');
  expect(json.examples[0].verification).toBeNull();
  const markdown = await request.get(fn.links.markdown);
  expect(markdown.ok()).toBe(true);
  expect(await markdown.text()).toContain(json.overloads[0].id);
  await page.goto(fn.links.html);
  await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute('href', fn.links.markdown);
  await expect(page.locator('link[rel="alternate"][type="application/json"]')).toHaveAttribute('href', fn.links.json);
  await expect(page.getByRole('button', { name: 'Copy for an agent' })).toHaveCount(0);
  await expect(page.locator('.agent-tools')).toHaveCount(0);
  expect(json.editorial.argumentNotes).toEqual([]);
  await expect(page.locator('[data-copy-signature]')).toHaveCount(0);
});

test('every guide recipe executes in the actual Haybarn WASM engine', async ({ page }) => {
  await page.goto('/products/haybarn/recipes/');
  const editors = page.locator('sql-playground');
  const expected = ['14.4', 'summer-harvest-2026', '205', 'Willow Creek', '31', '25'];
  for (let i = 0; i < expected.length; i++) {
    await editors.nth(i).getByRole('button', { name: /Run query/ }).click();
    await expect(editors.nth(i).locator('.result-table-wrap tbody')).toContainText(expected[i], { timeout: 60_000 });
    await expect(editors.nth(i)).not.toHaveClass(/has-error/);
  }
});

test('SQL errors recover and Stop restarts the engine', async ({ page }) => {
  await page.goto('/products/haybarn/playground/');
  const editor = page.locator('textarea');
  const run = page.getByRole('button', { name: /Run query/ });
  await editor.fill('SELECT not_a_real_function();');
  await run.click();
  await expect(page.locator('sql-playground')).toHaveClass(/has-error/, { timeout: 60_000 });
  await editor.fill('SELECT 42 AS answer;');
  await run.click();
  await expect(page.locator('.result-table-wrap tbody')).toContainText('42');
  await editor.fill('SELECT sum(sin(i)) FROM range(10000000000) t(i);');
  await run.click();
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(run).toBeEnabled();
  await editor.fill('SELECT 7 AS restarted;');
  await run.click();
  await expect(page.locator('.result-table-wrap tbody')).toContainText('7', { timeout: 60_000 });
});

test('results preserve nested decimals, large integers, timestamps, nulls, and literal HTML', async ({ page }) => {
  await page.goto('/products/haybarn/playground/');
  await page.locator('textarea').fill(`SELECT
    9007199254740993::BIGINT AS big,
    123456789012345678901234567890::HUGEINT AS huge,
    [-12.34::DECIMAL(9,2), 0.01::DECIMAL(9,2), NULL] AS decimals,
    {'price': 12.34::DECIMAL(9,2)} AS structured,
    MAP {'price': 12.34::DECIMAL(9,2)} AS mapped,
    TIMESTAMP '2026-06-03 12:34:56.123456' AS precise_time,
    [TIMESTAMP '1969-12-31 23:59:59.999999'] AS earlier,
    TIME '12:34:56.123456' AS time_of_day,
    DATE '2026-06-03' AS day,
    NULL AS missing,
    '<img src=x onerror=alert(1)>' AS literal;`);
  await page.getByRole('button', { name: /Run query/ }).click();
  const cells = page.locator('.result-table-wrap tbody td');
  await expect(cells).toHaveCount(11, { timeout: 60_000 });
  const values = await cells.allTextContents();
  expect(values).toEqual([
    '9007199254740993', '123456789012345678901234567890', '[-12.34, 0.01, NULL]',
    '{"price": 12.34}', 'MAP {"price": 12.34}', '2026-06-03 12:34:56.123456',
    '[1969-12-31 23:59:59.999999]', '12:34:56.123456', '2026-06-03', 'NULL', '<img src=x onerror=alert(1)>',
  ]);
  await expect(page.locator('.result-table-wrap img')).toHaveCount(0);
});

test('reference pages retain all overloads without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:4323${reference}regexp_extract/`);
  const panels = page.locator('[data-overload]');
  expect(await panels.count()).toBeGreaterThan(1);
  await expect(panels.last()).toBeVisible();
  await context.close();
});

test('release comparison rejects identical snapshots and navigates to real diffs', async ({ page }) => {
  await page.goto('/products/haybarn/function-changes/');
  await page.locator('#compare-from').selectOption('duckdb-1.3.2');
  await page.locator('#compare-to').selectOption('duckdb-1.3.2');
  await page.getByRole('button', { name: /Compare/ }).click();
  await expect(page.locator('.compare-message')).toContainText('two different');
  await page.locator('#compare-to').selectOption('duckdb-1.4.4');
  await page.getByRole('button', { name: /Compare/ }).click();
  await expect(page).toHaveURL('/products/haybarn/functions/compare/duckdb-1.3.2/duckdb-1.4.4/');
  await expect(page.locator('#added')).toContainText('Additional functions');
  await expect(page.locator('#changed .diff-detail').first()).toBeVisible();
});

test('mobile navigation, search shortcut, and layout work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ['/products/haybarn/functions/', catalog, `${reference}list_transform/`, `${reference}regexp_extract/`, `${reference}read_csv/`, '/products/haybarn/function-changes/', '/products/haybarn/playground/', '/products/haybarn/functions/agents/']) {
    await page.goto(url);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/products/haybarn/functions/');
  await page.getByRole('button', { name: 'Toggle function navigation' }).click();
  await expect(page.locator('#sidebar')).toBeVisible();
  await page.locator('#sidebar').getByRole('link', { name: /All functions/ }).click();
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.keyboard.press('/');
  await expect(page.getByRole('dialog', { name: 'Search functions' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search functions and examples' })).toBeFocused();
  await page.keyboard.press('Escape');
  await page.goto('/products/haybarn/functions/');
  await page.screenshot({ path: 'test-results/home-mobile.png', fullPage: true });
});
