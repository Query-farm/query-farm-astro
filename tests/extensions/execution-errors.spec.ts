import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { test, expect } from '../haybarn-functions/browser/fixtures';
import { captureTerminal, terminalText, waitForPrompt, runButton } from './wasm-helpers';

test.describe.configure({ mode: 'parallel' });

type Node = DefaultTreeAdapterMap['node'];
type Element = DefaultTreeAdapterMap['element'];
function* elements(node: Node): Generator<Element> {
  if ('tagName' in node) yield node;
  if ('childNodes' in node) for (const child of node.childNodes) yield* elements(child);
}

for (const scenario of [
  { name: 'fixture SQL', fixtures: 'SELECT missing_fixture_function();', sql: 'SELECT 42;', error: /missing_fixture_function/ },
  { name: 'quiet ATTACH', sql: "ATTACH ':memory:' AS broken (READ_ONLY); SELECT 42;", error: /read.only|in.memory/i },
  { name: 'an earlier statement', sql: 'SELECT missing_example_function(); SELECT 42;', error: /missing_example_function/ },
  { name: 'an explicitly expected error', sql: '-- expect-error: missing_expected_function\nSELECT missing_expected_function(); SELECT 42;', error: /Expected error:.*missing_expected_function/, status: 'succeeded' },
  { name: 'an expected error with the wrong message', sql: '-- expect-error: some other error\nSELECT missing_expected_function(); SELECT 42;', error: /Expected an error containing "some other error"/ },
  { name: 'success where an error was expected', sql: '-- expect-error: missing_expected_function\nSELECT 1; SELECT 42;', error: /but this statement succeeded/ },
  { name: 'an annotated fixture failure', fixtures: '-- expect-error: missing_fixture_function\nSELECT missing_fixture_function();', sql: 'SELECT 42;', error: /Error:.*missing_fixture_function/ },
  { name: 'a failed file fixture', fixtures: "COPY (SELECT missing_fixture_function()) TO 'broken.csv';", sql: 'SELECT 42;', error: /Error:.*missing_fixture_function/ },
  { name: 'an unexpected failure before an expected error', sql: 'SELECT unexpected_failure();\n-- expect-error: missing_expected_function\nSELECT missing_expected_function(); SELECT 42;', error: /Error:.*unexpected_failure/ },
  { name: 'repeated ATTACH after comments', sql: "-- First catalog\nATTACH ':memory:' AS example_data;\n/* Reopen with the same alias */ ATTACH ':memory:' AS example_data; SELECT 42;", error: /│\s*42\s*│/, status: 'succeeded' },
  { name: 'commented ATTACH IF NOT EXISTS preserves the catalog', sql: "ATTACH ':memory:' AS example_data; CREATE TABLE example_data.keep_me AS SELECT 42 AS n;\n-- Reuse the catalog\nATTACH IF NOT EXISTS ':memory:' AS example_data; SELECT n FROM example_data.keep_me;", error: /│\s*42\s*│/, status: 'succeeded' },
  { name: 'shared sample files across repeated runs', fixtures: "COPY (SELECT 42 AS n) TO 'shared-example.csv' (HEADER);", sql: "SELECT * FROM 'shared-example.csv';", error: /│\s*42\s*│/, status: 'succeeded', repeat: true },
]) {
  test(`example outcome: ${scenario.name}`, async ({ page }) => {
    await captureTerminal(page);
    // Only negative regression tests alter content: inject a controlled failure
    // into the real page, then use the real engine and UI to observe it.
    await page.route('**/products/extensions/rapidfuzz/', async route => {
      const response = await route.fetch();
      const document = parse(await response.text());
      const nodes = [...elements(document)];
      const pre = nodes.find(node => node.tagName === 'pre' && node.attrs.some(attr => attr.name === 'data-language' && attr.value === 'sql'))!;
      pre.childNodes = [{ nodeName: '#text', value: scenario.sql, parentNode: pre }];
      const island = nodes.find(node => node.tagName === 'astro-island' && node.attrs.some(attr => attr.name === 'component-url' && attr.value.includes('ExampleShellMounter.')))!;
      const propsAttribute = island.attrs.find(attr => attr.name === 'props')!;
      const props = JSON.parse(propsAttribute.value);
      props.fixtures = [0, scenario.fixtures ?? ''];
      propsAttribute.value = JSON.stringify(props);
      await route.fulfill({ response, body: serialize(document) });
    });
    await page.goto('/products/extensions/rapidfuzz/');
    const pre = page.locator('pre[data-language="sql"]').first();
    await runButton(pre).click();
    await waitForPrompt(page);
    await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', scenario.status ?? 'failed');
    if (scenario.status !== 'succeeded') await expect(page.locator('.example-shell').getByRole('status')).toHaveText('· example failed');
    const output = await terminalText(page);
    expect(output).toMatch(scenario.error);
    expect(output).toMatch(/│\s*42\s*│/);
    if (scenario.repeat) {
      await page.locator('.example-shell-close').click();
      await expect(page.locator('.example-shell')).toHaveCount(0);
      await runButton(pre).click();
      await waitForPrompt(page);
      await expect(page.locator('.example-shell')).toHaveAttribute('data-example-status', 'succeeded');
      expect(await terminalText(page)).toMatch(/│\s*42\s*│/);
    }
  });
}
