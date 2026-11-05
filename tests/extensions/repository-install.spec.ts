import { test, expect } from '../haybarn-functions/browser/fixtures';
import { captureTerminal, runButton, waitForPrompt, runSQL, requireLoadedExtension } from './wasm-helpers';

test('native repository commands load a second extension in the browser', async ({ page }) => {
  await captureTerminal(page);
  await page.goto('/products/extensions/textplot/');
  const pre = page.locator('pre[data-language="sql"]').filter({ hasText: 'SELECT tp_bar(' }).first();
  await runButton(pre).click();
  await waitForPrompt(page);
  await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');

  let output = '';
  for (const sql of [
    '/* A second extension from the native documentation. */ INSTALL a5 FROM query_farm;',
    'LOAD a5 FROM query_farm;',
    'SELECT a5_lonlat_to_cell(-74.0060, 40.7128, 10) IS NOT NULL AS cell_created;',
  ]) {
    output = await runSQL(page, sql);
    expect(output).not.toMatch(/(?:Error|Exception):/);
  }
  expect(output).toMatch(/│\s*true\s*│/);
  await requireLoadedExtension(page, 'a5');

  // Install instructions remain copyable native SQL, without a Run button.
  const install = page.locator('#quick-install');
  await expect(install.locator('pre').first()).toContainText('INSTALL textplot FROM query_farm;');
  await expect(install.locator('pre').first()).toContainText('LOAD textplot FROM query_farm;');
  await expect(install.locator('.example-toolbar-run-button, .example-try-button')).toHaveCount(0);
});
