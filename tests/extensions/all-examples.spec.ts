import assert from 'node:assert/strict';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from '../haybarn-functions/browser/fixtures';
import { exampleSql, browserUnavailableReason } from '../../src/lib/repl/example-sql';
import { wasmPages, type WasmPage } from './wasm-pages';
import { captureTerminal, terminalText, runButton, requireLoadedExtension, waitForPrompt } from './wasm-helpers';

test.use({ actionTimeout: 10_000 });
// Pages have independent engines/contexts; --workers can distribute them while
// the examples within each page retain the site's normal sequential behavior.
test.describe.configure({ mode: 'parallel' });

async function openPage(page: Page, target: WasmPage) {
  await page.goto(target.path);
  // Await hydration even on categories with zero examples. Otherwise a broken
  // island could make a page with missing Run buttons look like an empty pass.
  await expect(page.locator('astro-island[component-url*="ExampleShellMounter"][ssr]')).toHaveCount(0);
  const blocks = page.locator(target.selector);
  const examples: { index: number; sql: string }[] = [];
  const unavailable: { index: number; sql: string; reason: string }[] = [];
  for (let index = 0; index < await blocks.count(); index++) {
    const pre = blocks.nth(index);
    const sql = await pre.evaluate(exampleSql);
    if (!sql) continue; // The runner does not attach to empty blocks.
    await expect(pre).toHaveAttribute('data-example-shell-attached', 'true');
    const reason = browserUnavailableReason(sql);
    if (reason) {
      await expect(pre).toHaveAttribute('data-browser-run-disabled-reason', reason);
      await expect(runButton(pre)).toHaveCount(0);
      await expect(page.locator('.example-browser-unavailable').filter({ hasText: reason }).first()).toBeVisible();
      unavailable.push({ index, sql, reason });
      continue;
    }
    await expect(runButton(pre)).toHaveCount(1);
    examples.push({ index, sql });
  }
  await expect(page.locator('.example-toolbar-run-button, .example-try-button')).toHaveCount(examples.length);
  return { examples, unavailable };
}

async function revealExample(page: Page, pre: Locator) {
  const panel = pre.locator('xpath=ancestor::*[@role="tabpanel"][1]');
  if (await panel.count() && !await panel.isVisible()) {
    const tab = await panel.getAttribute('aria-labelledby');
    assert.ok(tab, 'A hidden example needs an accessible tab to open it');
    await page.locator(`[id=${JSON.stringify(tab)}]`).click();
  }
  // Open collapsible documentation through its real summary controls.
  const details = pre.locator('xpath=ancestor::details');
  for (const detail of await details.all()) {
    if (await detail.getAttribute('open') === null) await detail.locator(':scope > summary').click();
  }
}

// One test per published page amortizes engine startup. Each Run still opens
// the site's normal isolated session and runs its own fixtures and exact SQL.
// There is no hand-maintained query allowlist or skip-on-error behavior.
for (const target of wasmPages().sort((a, b) => a.path.localeCompare(b.path))) {
  test(`${target.extension}: every Run button on ${target.path}`, async ({ page }, info) => {
    await captureTerminal(page);
    const downloads: string[] = [];
    page.on('response', response => {
      if (response.url().includes('.duckdb_extension.wasm') && !response.ok()) downloads.push(`${response.status()} ${response.url()}`);
    });
    page.on('requestfailed', request => {
      if (request.url().includes('.duckdb_extension.wasm')) downloads.push(`${request.failure()?.errorText} ${request.url()}`);
    });
    const { examples, unavailable } = await openPage(page, target);
    test.setTimeout(90_000 + examples.length * 75_000);
    const results: { example: number; sql: string; error?: string; terminal?: string }[] = [];
    let checkedLoad = false;
    try {
      for (const [ordinal, example] of examples.entries()) {
        await test.step(`example ${ordinal + 1}: ${example.sql.replace(/\s+/g, ' ').slice(0, 100)}`, async () => {
          const result: (typeof results)[number] = { example: ordinal + 1, sql: example.sql };
          results.push(result);
          const downloadStart = downloads.length;
          let finished = false;
          try {
            const pre = page.locator(target.selector).nth(example.index);
            await revealExample(page, pre);
            await runButton(pre).click();
            const shell = page.locator('.example-shell');
            await expect(shell).toHaveAttribute('data-example-status', /^(succeeded|failed)$/, { timeout: 60_000 });
            finished = true;
            const bootErrors = await shell.locator('.example-shell-error').allTextContents();
            assert.equal(await shell.getAttribute('data-example-status'), 'succeeded', bootErrors.join('\n') || 'Extension load, setup, every SQL statement, and result rendering must succeed');
            await waitForPrompt(page);
            assert.deepEqual(downloads.slice(downloadStart), [], 'Published extension artifacts must download successfully');
            if (!checkedLoad) {
              if (target.source !== 'builtin') await requireLoadedExtension(page, target.extension);
              checkedLoad = true;
            }
          } catch (error) {
            result.error = error instanceof Error ? error.message : String(error);
            result.terminal = await terminalText(page).catch(() => 'Terminal unavailable');
            // Record the error as a failed step, then continue through the page
            // so one broken snippet cannot prevent checking the rest.
            throw error;
          } finally {
            if (finished) {
              await page.getByRole('button', { name: 'Close shell', exact: true }).click();
              await expect(page.locator('.example-shell')).toHaveCount(0);
            } else if (ordinal + 1 < examples.length) {
              // A crashed worker or timed-out query must not strand the rest.
              await openPage(page, target);
              checkedLoad = false;
            }
          }
        }).catch(error => {
          // Also retain failures opening/closing the UI, not only SQL errors.
          results[results.length - 1].error ??= String(error);
        });
      }
    } finally {
      await info.attach('examples', { body: JSON.stringify({ path: target.path, extension: target.extension, downloads, unavailable, results }, null, 2), contentType: 'application/json' });
    }
    const failures = results.filter(result => result.error);
    assert.equal(results.length, examples.length, 'Every offered example must be attempted');
    assert.equal(failures.length, 0, failures.map(result => {
      const errors = (result.terminal ?? '').split('\n')
        .filter(line => /^(?:Error:|Failed to render|This hit an internal error|Note:)/.test(line))
        .map(line => line.trimEnd());
      return `Example ${result.example}: ${result.sql.replace(/\s+/g, ' ').slice(0, 160)}\n${errors.join('\n') || result.error}`;
    }).join('\n\n'));
  });
}
