import { test, expect } from '@playwright/test';

test('language selection is explicit and every agent/language produces the right prompt', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const prompt = page.getByLabel('Your agent prompt · edit it to fit your project');
  await expect(page.getByLabel('2. Your worker language')).toHaveValue('');
  await expect(prompt).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled();
  for (const [id, name] of [['csharp', 'C#'], ['go', 'Go'], ['java', 'Java'], ['python', 'Python'], ['rust', 'Rust'], ['typescript', 'TypeScript']]) {
    await page.getByLabel('2. Your worker language').selectOption(id);
    await expect(prompt).toHaveValue(new RegExp(`Build a VGI worker in ${name.replace('#', '\\#')}\\.`));
    await expect(prompt).toHaveValue(/Verify the actual SQL results/);
    await expect(prompt).toHaveValue(/stock DuckDB 2.0.0 with VGI from query_farm/);
  }
  for (const [name, id] of [['Codex', 'codex'], ['Claude Code', 'claude-code'], ['Cursor', 'cursor'], ['GitHub Copilot', 'github-copilot'], ['OpenCode', 'opencode']]) {
    await page.getByRole('radio', { name, exact: true }).check();
    await expect(page.locator('[data-install-command]')).toContainText(`--agent ${id}`);
    await expect(prompt).toHaveValue(/Build a VGI worker in TypeScript/);
  }
  await page.getByLabel('3. A starting idea').selectOption('api');
  await expect(prompt).toHaveValue(/Ask me for its URL or specification/);
});

test('copy uses the edited prompt and reports success', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as typeof window & { copied: string }).copied = text; } }, configurable: true });
  });
  await page.goto('/vgi/build-with-an-agent/');
  await page.getByLabel('2. Your worker language').selectOption('go');
  const prompt = page.getByLabel('Your agent prompt · edit it to fit your project');
  await prompt.fill('Build my Go worker using the existing project conventions.');
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Prompt copied. Paste it into your coding agent.');
  expect(await page.evaluate(() => (window as typeof window & { copied: string }).copied)).toBe('Build my Go worker using the existing project conventions.');
});

test('mobile layout stays inside the viewport and navigation reaches the guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vgi/build-with-an-agent/');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByLabel('2. Your worker language').selectOption('java');
  await expect(page.locator('[data-language-requirements]')).toContainText('Java 21+');
});

test('recorded build exposes real source and SQL evidence, including slower runs', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/#recorded-build');
  await expect(page.getByRole('table', { name: 'Recorded builds with the vgi-worker skill' })).toContainText('5m 19s');
  await page.getByText('02 · The generated worker', { exact: true }).click();
  await expect(page.locator('[data-recorded-build]')).toContainText('defineScalarFunction');
  await expect(page.locator('[data-recorded-build]')).toContainText('Actual rows (JSON): [[10000]]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
