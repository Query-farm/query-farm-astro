import { test, expect } from './fixtures';
import { wasmVersion, defaultSnapshotId } from '../../../src/haybarn-functions/data/haybarn-release.mjs';

const guide = '/products/haybarn/functions/';

test('Query Farm search excludes Haybarn references, including when extension functions are enabled', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Search Query Farm' }).click();
  const modal = page.locator('#site-search-modal');
  await modal.getByRole('searchbox').fill('strftime');
  await expect(modal.locator('#site-search-status')).not.toContainText('Searching');
  await modal.getByLabel('Also search function names').check();
  await expect.poll(async () => page.evaluate(async () => {
    const path = '/pagefind/pagefind.js';
    const { search } = await import(/* @vite-ignore */ path);
    const result = await search('strftime', { filters: { kind: { any: ['page', 'function'] } } });
    const docs = await Promise.all(result.results.map((r: any) => r.data()));
    return docs.filter((doc: any) => doc.url.startsWith('/products/haybarn/functions/') && doc.url !== '/products/haybarn/functions/').length;
  })).toBe(0);
  await modal.getByRole('searchbox').fill('Haybarn SQL functions');
  await expect(modal.locator(`a[href="${guide}"]`)).toBeVisible();
});

test('the shared header and scoped function search coexist without duplicate IDs or keyboard handlers', async ({ page }) => {
  await page.goto(`${guide}strftime/`);
  await expect(page.getByRole('navigation', { name: 'Main', exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Haybarn section' }).getByRole('link', { name: 'Functions', exact: true })).toHaveAttribute('aria-current', 'page');
  const ids = await page.locator('[id]').evaluateAll(elements => elements.map(el => el.id));
  expect(ids.length).toBe(new Set(ids).size);
  await page.keyboard.press('Control+k');
  const search = page.locator('#haybarn-search');
  await expect(search).toBeVisible();
  await expect(page.locator('#site-search-modal')).toBeHidden();
  await search.getByRole('searchbox').fill('strftime');
  await expect(search.locator(`a[href="${guide}strftime/"]`)).toBeVisible();
  await search.getByLabel('Include other releases').check();
  await search.getByRole('searchbox').fill('Consulting');
  await expect(search.locator('#haybarn-search-status')).toContainText('No results');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Search Query Farm' }).click();
  await expect(page.locator('#site-search-modal')).toBeVisible();
  await expect(search).toBeHidden();
});

test('shared navigation aligns on desktop and mobile, and guide anchors clear wrapped navigation', async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/products/haybarn/', { waitUntil: 'domcontentloaded' });
    const reference = await page.locator('nav[aria-label="Main"] > a').boundingBox();
    await page.goto(`${guide}regexp_extract/`);
    const brand = await page.locator('nav[aria-label="Main"] > a').boundingBox();
    const section = await page.locator('nav[aria-label="Haybarn section"] > a').first().boundingBox();
    expect(brand!.x).toBe(reference!.x);
    expect(section!.x).toBe(reference!.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 320) {
      await page.getByRole('button', { name: 'Toggle function navigation' }).click();
      await expect(page.locator('#sidebar')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.locator('#sidebar')).toBeHidden();
      const last = page.locator('[data-overload]').last();
      await last.getByRole('link').click();
      await expect.poll(async () => {
        const target = await last.boundingBox();
        const nav = await page.locator('[data-haybarn-subnav]').boundingBox();
        return target!.y >= nav!.y + nav!.height - 1;
      }).toBe(true);
    }
  }
});

test('function pages use Query Farm sharing metadata and namespaced exports', async ({ page, request }) => {
  await page.goto(`${guide}strftime/?shared=1`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://query.farm${guide}strftime/`);
  await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'Query.Farm');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', await page.title());
  await expect(page.locator('meta[property="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  const image = new URL((await page.locator('meta[property="og:image"]').getAttribute('content'))!);
  expect(image.pathname).toBe(`${guide}social.png`);
  expect((await request.get(image.pathname)).ok()).toBe(true);
  await expect(page.locator('link[rel="icon"][type="image/svg+xml"]')).toHaveAttribute('href', '/favicon.svg?v=2');
  const info = await (await request.get(`${guide}build-info.json`)).json();
  expect(info.wasmVersion).toBe(wasmVersion);
  expect(info.wasm.every((asset: { path: string }) => asset.path.startsWith(`https://unpkg.com/@haybarn/haybarn-wasm@${wasmVersion}/`))).toBe(true);
  expect(await (await request.get('/llms.txt')).text()).toContain(`${guide}llms.txt`);
  await page.goto(`${guide}releases/${defaultSnapshotId}/strftime/`);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://query.farm${guide}strftime/`);
});
