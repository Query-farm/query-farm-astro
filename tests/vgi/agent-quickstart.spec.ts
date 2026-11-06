import { test, expect } from '@playwright/test';

test('language selection is explicit and every agent/language produces the right prompt', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const prompt = page.getByLabel('Your agent prompt · edit it to fit your project');
  await expect(page.locator('input[name="vgi-language"]:checked')).toHaveCount(0);
  await expect(prompt).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Copy prompt', exact: true })).toBeDisabled();
  for (const name of ['C#', 'Go', 'Java', 'Python', 'Rust', 'TypeScript']) {
    await page.getByRole('radio', { name, exact: true }).check();
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
  await page.getByRole('radio', { name: 'Go', exact: true }).check();
  const prompt = page.getByLabel('Your agent prompt · edit it to fit your project');
  await prompt.fill('Build my Go worker using the existing project conventions.');
  await page.getByRole('button', { name: 'Copy prompt', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Prompt copied. Paste it into your coding agent.');
  expect(await page.evaluate(() => (window as typeof window & { copied: string }).copied)).toBe('Build my Go worker using the existing project conventions.');
});

test('mobile layout and language guidance remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/vgi/build-with-an-agent/');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'Java', exact: true }).check();
  await expect(page.locator('[data-language-requirements]')).toContainText('Java 21+');
});

test('recorded build exposes real source and SQL evidence, including slower runs', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/#proof');
  await page.locator('[data-build-evidence] > summary').click();
  await expect(page.getByRole('table', { name: 'Recorded builds with the vgi-worker skill' })).toContainText('5m 19s');
  await page.getByText('02 · The generated worker', { exact: true }).click();
  await expect(page.locator('[data-recorded-build]')).toContainText('defineScalarFunction');
  await expect(page.locator('[data-recorded-build]')).toContainText('Actual rows (JSON): [[10000]]');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});


test('story explains the worker before installation and preserves missing quotes', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  expect(await page.evaluate(() => {
    const story = document.querySelector('[data-shipping-story]')!;
    const setup = document.querySelector('[data-agent-quickstart]')!;
    return Boolean(story.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(page.getByRole('table', { name: 'One quote: verified SQL results' })).toContainText('$5.50');
  await page.getByRole('tab', { name: 'Every order' }).click();
  await expect(page.getByRole('table', { name: 'Every order: verified SQL results' })).toContainText('No quote');
  await page.getByRole('tab', { name: 'Every order' }).press('ArrowRight');
  const results = page.getByRole('table', { name: 'Orders at risk: verified SQL results' });
  await expect(results).toContainText('A-103');
  await expect(results).toContainText('-$2.50');
  await expect(results).toContainText('A-105');
  await expect(results).toContainText('Review');
  await expect(results.locator('tbody tr')).toHaveCount(3);
  await expect(page.locator('[data-agent-quickstart] [data-brand]')).toHaveCount(11);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('query animation is controllable and respects reduced motion', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const flow = page.locator('[data-worker-flow]');
  await flow.getByRole('button', { name: 'Play the query' }).click();
  await expect(flow).toHaveAttribute('data-phase', '1');
  await expect(flow).not.toHaveAttribute('data-playing');
  await flow.getByRole('button', { name: 'Next step' }).click();
  await expect(flow).toHaveAttribute('data-phase', '2');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await flow.getByRole('button', { name: 'Play the query' }).click();
  await expect(flow).toHaveAttribute('data-playing', 'true');
  await flow.getByRole('button', { name: 'Pause animation' }).click();
  await expect(flow).not.toHaveAttribute('data-playing');
});

test('article introduces VGI and includes the useful example and captioned video', async ({ page }) => {
  await page.goto('/blog/build-vgi-workers-with-coding-agents/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DuckDB has your data');
  await expect(page.locator('main')).toContainText('Vector Gateway Interface');
  await page.getByRole('tab', { name: 'Orders at risk' }).click();
  await expect(page.getByRole('table', { name: 'Orders at risk: verified SQL results' })).toContainText('Review');
  await expect(page.locator('video track[kind="captions"]')).toHaveCount(1);
  expect((await page.request.get('/vgi/agents/codex.svg')).status()).toBe(200);
  const duration = await page.locator('video').evaluate(element => {
    const video = element as HTMLVideoElement;
    return new Promise<number>((resolve, reject) => {
    video.preload = 'metadata';
    video.addEventListener('loadedmetadata', () => resolve(video.duration), { once: true });
    video.addEventListener('error', () => reject(new Error('Video failed to load')), { once: true });
    video.load();
    });
  });
  expect(duration).toBeGreaterThan(49);
  expect(duration).toBeLessThan(55);
  expect((await page.request.get('/vgi/agents/worker-story.vtt')).status()).toBe(200);
});
