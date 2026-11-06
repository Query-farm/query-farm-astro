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
  await page.getByText('Have something else in mind?', { exact: true }).click();
  await page.getByLabel('A different starting idea').selectOption('api');
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


test('agent authorship appears before installation and the same worker processes a CSV', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  expect(await page.evaluate(() => {
    const proof = document.querySelector('[data-agent-proof]')!;
    const setup = document.querySelector('[data-agent-quickstart]')!;
    return Boolean(proof.compareDocumentPosition(setup) & Node.DOCUMENT_POSITION_FOLLOWING);
  })).toBe(true);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your coding agent can build');
  await expect(page.locator('[data-agent-proof]')).toContainText('Written and tested by Claude Code');
  await expect(page.locator('[data-agent-proof]')).toContainText('hello-vgi');
  await expect(page.locator('[data-shipping-story]')).toHaveCount(0);
  const rows = page.getByRole('table', { name: 'Article titles and verified slugs' });
  await expect(rows.locator('tbody tr')).toHaveCount(3);
  await expect(rows).toContainText('cafe-creme');
  await expect(page.locator('[data-agent-quickstart] [data-brand]')).toHaveCount(11);
  await page.getByRole('radio', { name: 'Python', exact: true }).check();
  await expect(page.locator('#worker-prompt')).toHaveValue(/article-title CSV/);
  const csv = await page.request.get('/vgi/agents/articles.csv');
  expect(csv.status()).toBe(200);
  expect(await csv.text()).toContain('Café crème');
});

test('build diagram is controllable and respects reduced motion', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const flow = page.locator('[data-agent-proof]');
  await flow.getByRole('button', { name: /Replay the build flow/ }).click();
  await expect(flow).toHaveAttribute('data-step', '1');
  await expect(flow).not.toHaveAttribute('data-playing');
  await flow.getByRole('button', { name: /Replay the build flow/ }).click();
  await expect(flow).toHaveAttribute('data-step', '2');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await flow.getByRole('button', { name: /Replay the build flow/ }).click();
  await expect(flow).toHaveAttribute('data-playing', 'true');
  await flow.getByRole('button', { name: 'Pause the build flow' }).click();
  await expect(flow).not.toHaveAttribute('data-playing');
});

test('recorded session exposes generated code, actual tests, and an attributed follow-on', async ({ page }) => {
  await page.goto('/vgi/agent-build-recording/');
  const replay = page.locator('[data-session-replay]');
  await expect(replay).toContainText('Recorded tool transcript · edited replay');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="1"]')).toBeVisible();
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="2"]')).toContainText('defineScalarFunction');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="3"]')).toContainText('pass 11');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="4"]')).toContainText('passed SQL NULL preserved');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="5"]')).toContainText('[[10000]]');
  await page.getByRole('button', { name: 'Next chapter' }).click();
  await expect(page.locator('[data-frame="6"]')).toContainText('Verified follow-on');
  await page.setViewportSize({ width:390, height:844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const transcript = await page.request.get('/vgi/agents/build-transcript.txt');
  expect(transcript.status()).toBe(200);
  expect(await transcript.text()).not.toContain('/Users/');
});

test('article introduces VGI and includes the useful example and captioned video', async ({ page }) => {
  await page.goto('/blog/build-vgi-workers-with-coding-agents/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Your coding agent can build a DuckDB function');
  await expect(page.locator('main')).toContainText('Vector Gateway Interface');
  await expect(page.getByRole('table', { name: 'Article titles and verified slugs' })).toContainText('version-2-0-beta');
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
  expect(duration).toBeGreaterThan(62);
  expect(duration).toBeLessThan(65);
  expect((await page.request.get('/vgi/agents/agent-build.vtt')).status()).toBe(200);
});
