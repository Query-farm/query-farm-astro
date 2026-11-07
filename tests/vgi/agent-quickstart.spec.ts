import { test, expect } from '@playwright/test';

test('requests are ready immediately and agent choice only changes installation', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const quickstart = page.locator('[data-agent-quickstart]');
  const requests = await quickstart.locator('[data-request-text]').allTextContents();
  await expect(quickstart.locator('textarea, select, input[name="vgi-language"]')).toHaveCount(0);
  await expect(quickstart.locator('.request-grid [data-copy-request]')).toHaveCount(3);
  for (const button of await quickstart.locator('.request-grid [data-copy-request]').all()) await expect(button).toBeEnabled();
  for (const prompt of requests) {
    expect(prompt).toMatch(/which.*language/);
    expect(prompt).toMatch(/test the worker/);
    expect(prompt).toMatch(/ATTACH/);
  }
  await quickstart.getByText('Installation help & compatibility', {exact:true}).click();
  for (const [name, id, directory] of [
    ['Codex', 'codex', '.agents/skills/'], ['Claude Code', 'claude-code', '.claude/skills/'],
    ['Cursor', 'cursor', '.cursor/skills/'], ['GitHub Copilot', 'github-copilot', '.github/skills/'],
    ['OpenCode', 'opencode', '.opencode/skills/'],
  ]) {
    await page.getByRole('radio', {name, exact:true}).check();
    await expect(quickstart.locator('[data-install-command]')).toContainText(`--agent ${id}`);
    await expect(quickstart.locator('[data-skill-directory]')).toHaveText(directory);
    expect(await quickstart.locator('[data-request-text]').allTextContents()).toEqual(requests);
  }
  await page.getByRole('radio', {name:'Other agents', exact:true}).check();
  await expect(quickstart.locator('[data-install-command]')).not.toContainText('--agent');
  await expect(quickstart.locator('[data-other-help]')).toBeVisible();
  await expect(quickstart.locator('[data-manual-help]')).toBeHidden();
});

test('installation and each starting request copy the visible text', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text: string) => { (window as typeof window & { copied: string }).copied = text; } }, configurable: true });
  });
  await page.goto('/vgi/build-with-an-agent/');
  const quickstart = page.locator('[data-agent-quickstart]');
  await page.getByRole('radio', {name:'Claude Code', exact:true}).check();
  await quickstart.getByRole('button', {name:'Copy skill installation command'}).click();
  expect(await page.evaluate(() => (window as typeof window & {copied:string}).copied)).toBe(await quickstart.locator('[data-install-command]').textContent());
  await expect(quickstart.locator('[data-install-status]')).toHaveText('Installation command copied.');
  await quickstart.getByText('Describe your own integration', {exact:true}).click();
  for (const card of await quickstart.locator('[data-request-card]').all()) {
    await card.getByRole('button', {name:/Copy request:/}).click();
    expect(await page.evaluate(() => (window as typeof window & {copied:string}).copied)).toBe(await card.locator('[data-request-text]').textContent());
    await expect(card.getByRole('status')).toHaveText('Copied. Paste this into your coding agent.');
  }
});

test('blocked clipboard leaves readable text and explains manual copying', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {value:{writeText:async () => {throw new Error('Permission denied');}}, configurable:true});
  });
  await page.goto('/vgi/build-with-an-agent/');
  const card = page.locator('#request-api');
  await card.getByRole('button', {name:/Copy request:/}).click();
  await expect(card.getByRole('status')).toContainText('Select the text above');
  await expect(card.locator('[data-request-text]')).toBeVisible();
});

test('mobile layout keeps installation, language guidance, and requests usable', async ({ page }) => {
  await page.setViewportSize({width:320,height:740});
  await page.goto('/vgi/build-with-an-agent/');
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const quickstart = page.locator('[data-agent-quickstart]');
  await page.getByRole('radio', {name:'Claude Code',exact:true}).check();
  await expect(quickstart.locator('[data-install-command]')).toContainText('--agent claude-code');
  await expect(quickstart.getByRole('list', {name:'Worker languages'}).locator('li')).toHaveCount(6);
  await expect(quickstart.getByText('Name your language, or let the agent ask before it writes code.', {exact:false})).toBeVisible();
  await expect(quickstart.locator('.request-grid [data-copy-request]')).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
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

test('VGI explanation is readable without motion and each step is keyboard accessible', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  const explanation = page.getByRole('region', { name: 'From an API to a SQL catalog with tables.' });
  await explanation.scrollIntoViewIfNeeded();
  await expect(explanation.getByRole('heading', { name: 'Now the data is part of your query.' })).toBeVisible();
  await expect(explanation).toHaveAttribute('data-playing', 'false');
  const build = explanation.getByRole('button', { name: 'Your agent builds', exact: true });
  await build.focus();
  await page.keyboard.press('Enter');
  await expect(build).toHaveAttribute('aria-pressed', 'true');
  await expect(explanation.getByRole('heading', { name: 'Describe the connection you need.' })).toBeVisible();
  await expect(explanation.locator('[data-attached-catalog]')).toBeHidden();
  await explanation.getByRole('button', { name: 'ATTACH the worker', exact: true }).click();
  await expect(explanation.getByRole('heading', { name: 'Bring a database into your session.' })).toBeVisible();
  await expect(explanation.locator('[data-attached-catalog]')).toBeVisible();
  await expect(explanation.locator('[data-attached-catalog]')).toContainText('github');
  await expect(explanation.locator('.catalog-schema')).toContainText('main');
  await expect(explanation.locator('.catalog-function')).toContainText('releases(…)');
  await expect(explanation.locator('.attach-sql')).toContainText("ATTACH 'github' AS github");
  await expect(explanation.locator('.agent-options [data-brand]')).toHaveCount(5);
  await explanation.getByRole('button', { name: 'The worker fetches', exact: true }).click();
  await expect(explanation).toContainText('The coding agent’s job is already done.');
  await expect(explanation.locator('[data-step-caption="3"]')).toBeVisible();
  await page.setViewportSize({width:320, height:740});
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('VGI animation advances once, pauses, and replays without moving focus', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.clock.install();
  await page.goto('/vgi/build-with-an-agent/');
  const explanation = page.locator('[data-vgi-explainer]');
  await explanation.scrollIntoViewIfNeeded();
  await expect(explanation).toHaveAttribute('data-playing', 'true');
  await page.clock.fastForward(6000);
  await expect(explanation.getByRole('heading', { name: 'Bring a database into your session.' })).toBeVisible();
  await explanation.getByRole('button', { name: 'Pause animation' }).click();
  await page.clock.fastForward(20000);
  await expect(explanation.locator('[data-step-caption="1"]')).toBeVisible();
  await explanation.getByRole('button', { name: 'Play animation' }).focus();
  await page.keyboard.press('Enter');
  await page.clock.fastForward(6000);
  await expect(explanation.locator('[data-step-caption="2"]')).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(explanation.locator('[data-step-caption="3"]')).toBeVisible();
  await page.clock.fastForward(6000);
  await expect(explanation.locator('[data-step-caption="4"]')).toBeVisible();
  await page.clock.fastForward(6500);
  await expect(explanation.getByRole('button', { name: 'Replay animation' })).toBeFocused();
  await expect(explanation).toHaveAttribute('data-playing', 'false');
  await page.clock.fastForward(20000);
  await expect(explanation.locator('[data-step-caption="4"]')).toBeVisible();
  await explanation.getByRole('button', { name: 'Replay animation' }).click();
  await expect(explanation.locator('[data-step-caption="0"]')).toBeVisible();
  await expect(explanation).toHaveAttribute('data-playing', 'true');
});

test('integration ideas link directly to the relevant starting requests', async ({ page }) => {
  await page.goto('/vgi/build-with-an-agent/');
  await expect(page.locator('[data-integration-idea]')).toHaveCount(4);
  for (const [idea, target] of [['files','files'], ['api','api'], ['github','api'], ['library','library']]) {
    await page.locator(`[data-integration-idea="${idea}"]`).click();
    await expect(page).toHaveURL(new RegExp(`#request-${target}$`));
    await expect(page.locator(`#request-${target}`)).toBeInViewport();
    await expect(page.locator(`#request-${target} [data-copy-request]`)).toBeEnabled();
  }
  await expect(page.locator('[data-agent-quickstart] [data-brand]')).toHaveCount(11);
});

test('live integration proof distinguishes real API results from sample inventory', async ({ page }) => {
  await page.goto('/blog/build-vgi-workers-with-coding-agents/');
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

test('article explains VGI and links to the generated worker and SQL evidence', async ({ page }) => {
  await page.goto('/blog/build-vgi-workers-with-coding-agents/');
  await expect(page.getByRole('heading',{level:1})).toContainText('bring the API into DuckDB');
  await expect(page.locator('main')).toContainText('Vector Gateway Interface');
  await expect(page.getByRole('table', {name:'Live releases joined to sample project inventory'}).locator('tbody tr')).toHaveCount(2);
  await expect(page.getByRole('link', {name:'Get the generated worker and tests →'})).toHaveAttribute('href', /examples\/agent-github-releases\/README.md$/);
  await expect(page.locator('video, a[href*="agent-build-recording"]')).toHaveCount(0);
});
