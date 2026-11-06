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
  await page.getByLabel('3. What should it build?').selectOption('api');
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


test('newcomers and extension developers get distinct introductions', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  await expect(page.getByRole('heading', { level:1 })).toContainText('Connect anything');
  const newcomer = page.getByRole('tab', { name:'New to database extensions?' });
  await expect(newcomer).toHaveAttribute('aria-selected','true');
  await expect(page.locator('#intro-new')).toContainText('An extension adds capabilities');
  await newcomer.press('ArrowRight');
  await expect(page.getByRole('tab', { name:'Familiar with extensions?' })).toBeFocused();
  await expect(page.locator('#intro-dev')).toBeVisible();
  await expect(page.locator('#intro-dev')).toContainText('separate process');
  await expect(page.locator('#intro-new')).toBeHidden();
  await page.getByRole('tab', { name:'Familiar with extensions?' }).press('Home');
  await expect(page.locator('#intro-new')).toBeVisible();
});

test('integration ideas carry into the prompt without choosing a language', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  await expect(page.locator('[data-choose-recipe]')).toHaveCount(4);
  await page.locator('[data-choose-recipe="files"]').click();
  await expect(page.getByLabel('3. What should it build?')).toHaveValue('files');
  await expect(page.locator('input[name="vgi-language"]:checked')).toHaveCount(0);
  await expect(page.locator('#worker-prompt')).toHaveValue('');
  await page.getByRole('radio', { name:'Rust', exact:true }).check();
  await expect(page.locator('#worker-prompt')).toHaveValue(/local folder of photos/);
  await expect(page.locator('#worker-prompt')).toHaveValue(/Build a VGI worker in Rust/);
  await page.locator('[data-choose-recipe="api"]').click();
  await expect(page.locator('#worker-prompt')).toHaveValue(/service API/);
  await expect(page.locator('#worker-prompt')).toHaveValue(/Rust/);
  await expect(page.locator('[data-agent-quickstart] [data-brand]')).toHaveCount(11);
});

test('live integration proof distinguishes real API results from sample inventory', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const result=page.getByRole('table', { name:'Live releases joined to sample project inventory' });
  await expect(result.locator('tbody tr')).toHaveCount(2);
  await expect(result).toContainText('Analytics demo');
  await expect(page.locator('[data-integration-demo]')).toContainText('Actual API results recorded');
  await expect(page.locator('[data-integration-demo]')).toContainText('sample data');
  await page.getByText('Inspect the query the agent wrote', {exact:true}).click();
  await expect(page.locator('[data-integration-demo]')).toContainText("github.main.releases('duckdb', 'duckdb')");
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('article and full capture present the actual running agent', async ({ page }) => {
  await page.goto('/blog/build-vgi-workers-with-coding-agents/');
  await expect(page.getByRole('heading',{level:1})).toContainText('bring the API into DuckDB');
  await expect(page.locator('main')).toContainText('Vector Gateway Interface');
  await expect(page.locator('video track[kind="captions"]')).toHaveCount(1);
  await expect(page.locator('video source')).toHaveAttribute('src','/vgi/agents/github-build.mp4');
  const duration=await page.locator('video').evaluate(element=>{
    const video=element as HTMLVideoElement;
    return new Promise<number>((resolve,reject)=>{
      video.preload='metadata';
      video.addEventListener('loadedmetadata',()=>resolve(video.duration),{once:true});
      video.addEventListener('error',()=>reject(new Error('Video failed to load')),{once:true});video.load();
    });
  });
  expect(duration).toBeGreaterThan(30);expect(duration).toBeLessThan(240);
  expect((await page.request.get('/vgi/agents/github-build.vtt')).status()).toBe(200);
  await page.goto('/vgi/agent-build-recording/');
  await expect(page.getByRole('heading',{level:1})).toContainText('actual agent session');
  await expect(page.locator('video source')).toHaveAttribute('src','/vgi/agents/github-build-full.mp4');
  await expect(page.locator('[data-session-replay]')).toHaveCount(0);
});
