import assert from 'node:assert/strict';
import { test, expect } from '../haybarn-functions/browser/fixtures';
import { exampleSql } from '../../src/lib/repl/example-sql';

// This example uses a map renderer rather than ExampleShellMounter. The live
// train board reuses SQL already exercised by the generic /vgi/ Run controls.
test('VGI map: execute the documented SQL and render its real results', async ({ page }, info) => {
  test.setTimeout(150_000);
  const downloads: string[] = [];
  page.on('response', response => {
    if (response.url().includes('.duckdb_extension.wasm') && !response.ok()) downloads.push(`${response.status()} ${response.url()}`);
  });
  page.on('requestfailed', request => {
    if (request.url().includes('.duckdb_extension.wasm')) downloads.push(`${request.failure()?.errorText} ${request.url()}`);
  });
  await page.goto('/vgi/');
  await page.locator('#tour-tab-map').click();
  const panel = page.locator('#tour-panel-map');
  const sql = await panel.locator('pre').evaluate(exampleSql);
  const button = panel.locator('.overture-map-button');
  await button.scrollIntoViewIfNeeded();
  await expect(panel.locator('astro-island[component-url*="OvertureMapExample"][ssr]')).toHaveCount(0);
  try {
    await button.click();
    await expect.poll(async () => {
      const errors = await panel.locator('.overture-map-error').allTextContents();
      assert.deepEqual(errors, [], errors.join('\n'));
      return button.getAttribute('aria-label');
    }, { timeout: 120_000, message: 'The displayed map query must execute successfully' }).toBe('Map loaded');
    assert.deepEqual(downloads, [], 'Published extension artifacts must download successfully');
    await expect(panel.locator('.leaflet-overlay-pane .leaflet-interactive').first()).toBeVisible();
    await expect(panel.locator('.overture-map-legend')).toContainText(/\([1-9]\d*\)/);
  } finally {
    await info.attach('map-example', { body: JSON.stringify({
      path: '/vgi/', sql, downloads,
      errors: await panel.locator('.overture-map-error').allTextContents(),
      result: await panel.locator('.overture-map-legend').allTextContents(),
    }, null, 2), contentType: 'application/json' });
  }
});
