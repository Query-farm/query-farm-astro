import assert from 'node:assert/strict';
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

type Terminal = { buffer: { active: { length: number; getLine(index: number): { translateToString(): string } | undefined } } };
type TerminalWindow = typeof window & { wasmTestTerminals?: Terminal[] };

export async function captureTerminal(page: Page) {
  await page.addInitScript(() => {
    const probe = window as TerminalWindow;
    const terminals: Terminal[] = [];
    probe.wasmTestTerminals = terminals;
    let terminal: (new (...args: unknown[]) => Terminal) | undefined;
    Object.defineProperty(window, 'Terminal', {
      configurable: true,
      get: () => terminal,
      set(value: new (...args: unknown[]) => Terminal) {
        terminal = new Proxy(value, {
          construct(target, args) {
            const instance = Reflect.construct(target, args) as Terminal;
            terminals.splice(0, terminals.length, instance);
            return instance;
          },
        });
      },
    });
  });
}

export async function terminalText(page: Page) {
  return page.evaluate(() => ((window as TerminalWindow).wasmTestTerminals ?? []).map(terminal =>
    Array.from({ length: terminal.buffer.active.length }, (_, index) =>
      terminal.buffer.active.getLine(index)?.translateToString() ?? '').join('\n')).join('\n'));
}

export async function waitForPrompt(page: Page) {
  await expect.poll(async () => {
    const failure = await page.locator('.example-shell-error').allTextContents();
    assert.equal(failure.length, 0, failure.join('\n'));
    return (await terminalText(page)).trimEnd();
  }, { timeout: 60_000, message: 'The documented SQL must finish in the browser shell' }).toMatch(/H >$/);
}

export async function runSQL(page: Page, sql: string) {
  const before = await terminalText(page);
  await page.locator('.example-shell .xterm-helper-textarea').pressSequentially(sql);
  await page.keyboard.press('Enter');
  await expect.poll(() => terminalText(page)).not.toBe(before);
  await waitForPrompt(page);
  return terminalText(page);
}

export async function requireLoadedExtension(page: Page, extension: string) {
  assert.match(extension, /^[a-z0-9_]+$/);
  const output = await runSQL(page, `SELECT CASE WHEN EXISTS (SELECT 1 FROM duckdb_extensions() WHERE extension_name = '${extension}' AND loaded) THEN 'wasm-load-ok' ELSE 'wasm-load-failed' END AS extension_status;`);
  assert.match(output, /│\s*wasm-load-ok\s*│/, `${extension} must actually LOAD in the browser, even if ordinary SQL still works:\n${output}`);
}

export function runButton(pre: Locator) {
  const wrapper = pre.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " code-block-wrapper ") or (self::figure and contains(concat(" ", normalize-space(@class), " "), " frame "))][1]');
  return wrapper.locator('.example-toolbar-run-button').or(wrapper.locator('xpath=following-sibling::*[1]').locator('.example-try-button'));
}
