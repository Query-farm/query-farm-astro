import { test, expect } from '../haybarn-functions/browser/fixtures';
import { captureTerminal, terminalText, waitForPrompt, runSQL, requireLoadedExtension } from '../extensions/wasm-helpers';

const root = '/products/haybarn/extensions';

test('a contributor extension loads on demand and accepts SQL without auto-running file-dependent examples', async ({ page }) => {
  test.setTimeout(120_000);
  const downloads: string[] = [];
  page.on('request', request => {
    if (/duckdb-base\.wasm|\.duckdb_extension\.wasm/.test(request.url())) downloads.push(request.url());
  });
  await captureTerminal(page);
  await page.goto(`${root}/webbed`);
  const launch = page.getByRole('button', { name: 'Try webbed in your browser', exact: true });
  const headerLaunch = page.getByRole('link', { name: 'Try in browser', exact: true });
  await expect(headerLaunch).toBeVisible();
  await expect(launch).toBeVisible();
  expect(downloads).toEqual([]);
  await expect(page.locator('#example pre')).toContainText("read_html_blocks('index.html')");
  await expect(page.locator('#example .example-toolbar-run-button')).toHaveCount(0);
  await headerLaunch.click();
  await waitForPrompt(page);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');
  expect(await terminalText(page)).toContain('webbed is loaded');
  expect(await terminalText(page)).not.toContain('index.html');
  await expect(headerLaunch).toHaveAttribute('aria-expanded', 'true');
  await headerLaunch.click();
  await expect(page.locator('.example-shell')).toHaveCount(1);
  await requireLoadedExtension(page, 'webbed');
  const output = await runSQL(page, "SELECT xml_extract_text('<book><title>Database Guide</title></book>', '//title');");
  expect(output).toMatch(/│\s*\[Database Guide\]\s*│/);
  expect(downloads.some(url => url.includes('/community/v2.0.0/wasm_eh/webbed.duckdb_extension.wasm'))).toBe(true);

  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Close shell', exact: true }).click();
  await expect(page.locator('.example-shell')).toHaveCount(0);
  await expect(launch).toHaveAttribute('aria-expanded', 'false');
  await expect(headerLaunch).toHaveAttribute('aria-expanded', 'false');
  await launch.click();
  await waitForPrompt(page);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');
});

test('native-only and known incompatible extensions retain their SQL without a browser launcher', async ({ page }) => {
  for (const name of ['aixchess', 'anofox_similarity', 'sitemap', 'stats_duck', 'cronjob']) {
    await page.goto(`${root}/${name}`);
    await expect(page.locator('#install pre')).toContainText(`INSTALL ${name} FROM community;`);
    await expect(page.locator('astro-island[component-url*="ExampleShellMounter"]')).toHaveCount(0);
    await expect(page.locator('.example-toolbar-run-button')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Try in browser', exact: true })).toHaveCount(0);
    if (['anofox_similarity', 'sitemap', 'stats_duck'].includes(name)) {
      await expect(page.locator('#install')).toContainText('cannot load in the current browser session');
      await expect(page.locator('[data-platform="WASM"]')).toContainText('eh');
    }
  }
  await expect(page.locator('#install')).toContainText('background threads');
});

test('the visible header action honors a click before the browser runner hydrates', async ({ page }) => {
  test.setTimeout(120_000);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/*ExampleShellMounter*', async route => { await gate; await route.continue(); });
  await captureTerminal(page);
  try {
    await page.goto(`${root}/webbed`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('link', { name: 'Try in browser', exact: true }).click();
    await expect(page).toHaveURL(/#browser-session$/);
    await expect(page.locator('.example-shell')).toHaveCount(0);
  } finally { release(); }
  await waitForPrompt(page);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');
  await requireLoadedExtension(page, 'webbed');
});

test('a failed extension download is reported as failure even though the SQL engine starts', async ({ page }) => {
  test.setTimeout(120_000);
  await page.route('**/community/**/webbed.duckdb_extension.wasm', route => route.fulfill({
    status: 404, body: 'Unavailable extension regression test', headers: { 'Access-Control-Allow-Origin': '*' },
  }));
  await captureTerminal(page);
  await page.goto(`${root}/webbed`);
  await page.getByRole('button', { name: 'Try webbed in your browser', exact: true }).click();
  await waitForPrompt(page);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'failed');
  await expect(page.locator('.example-shell-head')).toContainText('extension failed to load');
  expect(await terminalText(page)).toContain('Could not load webbed:');
  expect(await terminalText(page)).not.toContain('webbed is loaded');
});
