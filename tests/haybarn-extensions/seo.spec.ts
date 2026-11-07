import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'parse5';
import { categories } from '../../src/data/haybarn-extensions/taxonomy.mjs';
import { PAGE_SIZE, pageCount, directoryPagePath } from '../../src/data/haybarn-extensions/pagination.mjs';
import { supportsBrowserSession, browserSessionIssue } from '../../src/data/haybarn-extensions/browser.mjs';

const root = '/products/haybarn/extensions';
const dist = resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'dist');
const read = (path: string) => readFileSync(resolve(dist, `.${path}`), 'utf8');
const catalog = JSON.parse(read(`${root}/catalog.json`));
const attribute = (node: any, name: string) => node.attrs?.find((attr: any) => attr.name === name)?.value;
const text = (node: any): string => node.value ?? (node.childNodes ?? []).map(text).join('');
function readDocument(path: string) {
  const nodes: any[] = [];
  function walk(node: any) { nodes.push(node); (node.childNodes ?? []).forEach(walk); }
  walk(parse(read(`${path}/index.html`)));
  return {
    nodes,
    title: text(nodes.find(node => node.tagName === 'title')),
    canonical: attribute(nodes.find(node => node.tagName === 'link' && attribute(node, 'rel') === 'canonical'), 'href'),
    robots: attribute(nodes.find(node => node.tagName === 'meta' && attribute(node, 'name') === 'robots'), 'content'),
    schemas: nodes.filter(node => node.tagName === 'script' && attribute(node, 'type') === 'application/ld+json').map(node => JSON.parse(text(node))),
  };
}

test('crawl rules block filter combinations while preserving every canonical page', async ({ request }) => {
  const robots = await (await request.get('/robots.txt')).text();
  // The site's rules share one wildcard user-agent group and an Allow: /.
  // Match its disallow patterns against paths and query strings, as Google does.
  expect(robots.match(/^User-agent:.*$/gim)).toEqual(['User-agent: *']);
  expect(robots.match(/^Allow:.*$/gim)).toEqual(['Allow: /']);
  const disallows = [...robots.matchAll(/^Disallow:\s*(\S+)/gim)].map(([, pattern]) =>
    new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')));
  const blocked = (path: string) => disallows.some(pattern => pattern.test(path));
  for (const path of [root, `${root}/`, `${root}/page/2/`, `${root}/category/files/`, `${root}/category/files/page/2/`]) {
    for (const filter of ['q=read+Excel', 'platform=wasm_eh', 'publisher=query-farm', 'release=1.5.4']) {
      expect(blocked(`${path}?${filter}`), `${path}?${filter}`).toBe(true);
      expect(blocked(`${path}?utm_source=test&${filter}`), `${path}?utm_source=test&${filter}`).toBe(true);
    }
  }
  const sitemap = read('/sitemap-0.xml');
  for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const url = new URL(location);
    expect(blocked(url.pathname + url.search), location).toBe(false);
    expect(url.search, location).toBe('');
  }
  for (const path of [`${root}/?utm_source=test`, '/products/haybarn/functions/?q=read_csv', '/_astro/app.js', '/pagefind/pagefind.js']) {
    expect(blocked(path), path).toBe(false);
  }
  expect((await request.get(`${root}/page/9999/`)).status()).toBe(404);
});

test('directory and category HTML, canonical URLs, and structured lists agree', () => {
  for (const category of [null, ...categories]) {
    const scope = catalog.extensions.filter((entry: any) => !category || entry.categories.includes(category.id));
    for (let number = 1; number <= pageCount(scope.length); number++) {
      const path = directoryPagePath(number, category?.id);
      const page = readDocument(path);
      const expected = scope.slice((number - 1) * PAGE_SIZE, number * PAGE_SIZE);
      const entries = page.nodes.filter(node => attribute(node, 'data-extension') !== undefined);
      expect(entries.map(node => attribute(node, 'data-extension')), path).toEqual(expected.map((entry: any) => entry.name));
      expect(entries.every(node => attribute(node, 'hidden') === undefined), path).toBe(true);
      expect(page.title).toContain('DuckDB');
      expect(page.title).toContain('Haybarn');
      expect(page.canonical).toBe(`https://query.farm${path}/`);
      expect(page.robots).not.toContain('noindex');
      expect(page.nodes.filter(node => node.tagName === 'h1')).toHaveLength(1);
      const schema = page.schemas.find(item => item['@type'] === 'CollectionPage');
      expect(schema.mainEntity.numberOfItems).toBe(expected.length);
      expect(schema.mainEntity.itemListElement.map((item: any) => item.url)).toEqual(expected.map((entry: any) => `https://query.farm${entry.href}/`));
      expect(page.schemas.some(item => item['@type'] === 'BreadcrumbList')).toBe(true);
      const initialData = JSON.parse(text(page.nodes.find(node => attribute(node, 'id') === 'extension-directory-data')));
      expect(initialData.map((item: any) => item.name)).toEqual(scope.map((entry: any) => entry.name));
      expect(read('/sitemap-0.xml')).toContain(page.canonical);
      if (number < pageCount(scope.length)) {
        expect(page.nodes.some(node => node.tagName === 'a' && attribute(node, 'href') === directoryPagePath(number + 1, category?.id))).toBe(true);
      }
    }
  }
});

test('every extension has an indexable local destination and community guides show its real builds', () => {
  const sitemap = read('/sitemap-0.xml');
  const destinations = new Set();
  for (const extension of catalog.extensions) {
    expect(extension.href.startsWith('/products/'), extension.name).toBe(true);
    expect(destinations.has(extension.href), extension.name).toBe(false);
    destinations.add(extension.href);
    const page = readDocument(extension.href);
    expect(page.canonical).toBe(`https://query.farm${extension.href}/`);
    expect(page.robots).not.toContain('noindex');
    expect(sitemap, extension.name).toContain(page.canonical);
    if (!page.nodes.some(node => attribute(node, 'data-community-guide') === extension.name)) continue;
    expect(page.title).toContain(extension.displayName);
    expect(page.title).toContain('DuckDB');
    const snippets = page.nodes.filter(node => node.tagName === 'pre').map(text);
    expect(snippets).toContain(`INSTALL ${extension.name} FROM community;\nLOAD ${extension.name} FROM community;`);
    const downloads = page.nodes.filter(node => node.tagName === 'a' && attribute(node, 'href')?.startsWith('https://haybarn-extensions.query.farm/community/'));
    expect(downloads, extension.name).toHaveLength(extension.availability.length);
    for (const artifact of extension.availability) {
      expect(downloads.some(node => attribute(node, 'href').includes(`/v${artifact.version}/${artifact.platform}/${extension.name}.`)), `${extension.name}: ${artifact.platform}`).toBe(true);
    }
    expect(page.nodes.some(node => node.tagName === 'a' && attribute(node, 'href') === extension.docsUrl)).toBe(true);
    expect(page.schemas.find(item => item['@type'] === 'TechArticle')?.about.codeRepository).toBe(extension.repository);
    const localMetadata = (() => {
      try { return JSON.parse(readFileSync(resolve(`src/data/extensions/${extension.name}/augment/metadata.json`), 'utf8')); }
      catch (error: any) { if (error.code === 'ENOENT') return {}; throw error; }
    })();
    const browser = !localMetadata.browserRunDisabledReason && !browserSessionIssue(extension) && supportsBrowserSession(extension.availability);
    const runnable = page.nodes.filter(node => node.tagName === 'pre' && attribute(node, 'data-language') !== undefined);
    expect(runnable, extension.name).toHaveLength(browser ? 1 : 0);
    if (browser) expect(text(runnable[0])).toBe(`INSTALL ${extension.name} FROM community;\nLOAD ${extension.name} FROM community;`);
  }
});

test('category search stays scoped and carries filters through category navigation', async ({ page }) => {
  await page.goto(`${root}/category/files?q=zarr`);
  await expect(page.locator('[data-extension]:visible')).toHaveCount(1);
  await expect(page.locator('[data-extension="zarr"] h2 a')).toHaveAttribute('href', `${root}/zarr`);
  await expect(page.locator('[data-extension="rapidfuzz"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear filters' }).click();
  const count = catalog.extensions.filter((entry: any) => entry.categories.includes('files')).length;
  await expect(page.locator('[data-extension]:visible')).toHaveCount(Math.min(count, PAGE_SIZE));
  const owner = catalog.extensions.find((entry: any) => entry.name === 'zarr').publisher.toLowerCase();
  await page.locator('#extension-publisher').selectOption(owner);
  await page.getByRole('navigation', { name: 'Extension categories' }).getByRole('link', { name: /All extensions/ }).click();
  expect(new URL(page.url()).searchParams.get('publisher')).toBe(owner);
  await expect(page.locator('#extension-publisher')).toHaveValue(owner);
  const emptyCategory = categories.find(category => !catalog.extensions.some((entry: any) => entry.categories.includes(category.id) && entry.publisher.toLowerCase() === owner))!;
  await page.getByRole('navigation', { name: 'Extension categories' }).locator(`[data-category="${emptyCategory.id}"]`).click();
  await expect(page.locator('#extension-publisher')).toHaveValue(owner);
  await expect(page.locator('.directory-empty')).toBeVisible();
  await page.getByRole('navigation', { name: 'Extension categories' }).getByRole('link', { name: /All extensions/ }).click();
  await page.locator('#extension-query').fill('zarr');
  await page.locator('[data-extension="zarr"] h2 a').click();
  await expect(page).toHaveURL(/\/extensions\/zarr\/?$/);
  await expect(page.locator('#install')).toContainText('LOAD zarr FROM community;');
});

test('search reaches later pages offline and resets pagination when the query changes', async ({ page }) => {
  await page.route('**/pagefind/**', route => route.abort());
  await page.goto(`${root}/page/3`);
  await expect(page.locator('#extension-result-count')).toContainText('41–60');
  const query = page.getByRole('searchbox', { name: 'What do you want to do?' });
  await query.fill('zarr');
  await expect(page.locator('[data-extension="zarr"]')).toBeVisible();
  await expect(page).not.toHaveURL(/\/page\//);
  await expect(page).toHaveURL(/q=zarr/);
  const metadata = await page.evaluate(() => ({
    canonical: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')!.href,
    breadcrumbs: [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(script => JSON.parse(script.textContent!)).find(schema => schema['@type'] === 'BreadcrumbList').itemListElement,
  }));
  expect(metadata.canonical).toBe(`https://query.farm${root}/`);
  expect(metadata.breadcrumbs.at(-1).item).toBe(metadata.canonical);
  expect(metadata.breadcrumbs.filter((item: any) => item.item === metadata.canonical)).toHaveLength(1);
  await page.reload();
  await expect(page.locator('[data-extension="zarr"]')).toBeVisible();
  await query.fill('no-such-extension-zzzz');
  await expect(page.locator('.directory-empty')).toBeVisible();
  await expect(page.locator('.directory-pagination')).toBeHidden();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('[data-extension]')).toHaveCount(PAGE_SIZE);
  await expect(page.locator('.directory-pagination')).toBeVisible();
});

test('community guides are useful without JavaScript and fit narrow screens', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const page = await context.newPage();
  for (const name of ['aixchess', 'zarr', 'rusty_quack', 'adbc', 'motorsport_telemetry']) {
    await page.goto(`${root}/${name}`);
    await expect(page.locator('#install')).toContainText(`INSTALL ${name} FROM community;`);
    await expect(page.getByRole('list', { name: 'Platform availability' })).toBeVisible();
    if (name === 'aixchess') {
      await expect(page.locator('#install pre')).toHaveCount(1);
      await expect(page.locator('#example h2')).toHaveText('Usage example');
      const sections = await page.locator('.guide-body > section').evaluateAll(sections => sections.map(section => section.id));
      expect(sections.indexOf('example')).toBe(sections.indexOf('install') + 1);
      expect(sections.indexOf('overview')).toBeGreaterThan(sections.indexOf('example'));
      await expect(page.locator('.example-result')).toContainText('3496');
      await expect(page.getByRole('link', { name: /Function reference Reference linked/ })).toHaveAttribute('href', 'https://github.com/thomas-daniels/aix/blob/main/docs/functions.md');
      await expect(page.locator('[data-platform="Linux"]')).toContainText('aarch64');
      await expect(page.locator('[data-platform="macOS"]')).toContainText('Apple Silicon');
      await expect(page.locator('[data-platform="Windows"]')).toContainText('x86_64 (MinGW)');
      await expect(page.locator('[data-platform="WASM"]')).toContainText('Not available');
    }
    await page.locator('#availability summary').click();
    await expect(page.locator('#availability table')).toBeVisible();
    await expect(page.locator('#sources a').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name).toBe(true);
  }
  await page.goto(`${root}/category/files`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await context.close();
});
