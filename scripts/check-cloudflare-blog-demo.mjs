// Live smoke test. Build with INCLUDE_DRAFTS=true, then start the preview:
// node --import tsx scripts/haybarn-functions/preview-test.mjs
// Writes the article's synthetic visitor note to the public disposable demo.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BLOG_PREVIEW_URL || 'http://127.0.0.1:4323';
const artifacts = process.env.BLOG_REVIEW_DIR || '/tmp/grainlift-blog-review';
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
// Capture xterm's actual buffer without changing the production shell.
await page.addInitScript(() => {
  window.__reviewTerminals = [];
  let terminal;
  Object.defineProperty(window, 'Terminal', {
    configurable: true,
    get() { return terminal; },
    set(value) {
      terminal = new Proxy(value, {
        construct(target, args) {
          const instance = Reflect.construct(target, args);
          window.__reviewTerminals.push(instance);
          return instance;
        },
      });
    },
  });
});
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') console.log('Browser console:', message.text());
});
page.on('requestfailed', request => console.log('Request failed:', request.url(), request.failure()?.errorText));
const terminalText = () => page.evaluate(() => window.__reviewTerminals.map(terminal =>
  Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i)?.translateToString()).join('\n')));
const progress = setInterval(async () => {
  try { console.log('Browser status:', (await terminalText()).map(text => text.trim().slice(-400))); } catch { /* navigating */ }
}, 15_000);
try {
  await page.goto(`${base}/blog/query-cloudflare-from-duckdb/`, { waitUntil: 'networkidle' });
  const buttons = page.locator('.example-try-button');
  await buttons.first().waitFor();
  assert.equal(await buttons.count(), 4, 'only the four public examples are runnable');
  const expected = ['House blend', 'Shared public demo', 'Hello from the blog', 'units_to_go'];
  const queries = ['SELECT p.name', 'SELECT description', 'CALL grainlift_execute', 'WITH targets'];
  // Start every example together: opening a shell must not detach a catalog
  // that an earlier shell is still using (especially the INSERT + SELECT).
  if (process.env.CONCURRENT === 'true') {
    for (let i = 0; i < expected.length; i++) await buttons.nth(i).click();
  }
  for (let i = 0; i < expected.length; i++) {
    if (process.env.CONCURRENT !== 'true') await buttons.nth(i).click();
    await page.waitForFunction(({ query, text }) => {
      const outputs = window.__reviewTerminals.map(terminal => Array.from({ length: terminal.buffer.active.length }, (_, i) => terminal.buffer.active.getLine(i)?.translateToString()).join('\n').trim());
      const output = outputs.find(output => output.includes(query)) ?? '';
      // Wait for the result and the final prompt, not just echoed SQL.
      return output.endsWith('H >') && (/Error:/.test(output) || (output.includes(text) && /\d+ rows?\s+\d+ columns?/.test(output)));
    }, { query: queries[i], text: expected[i] }, { timeout: 120_000 });
    const output = (await terminalText()).find(output => output.includes(queries[i]));
    assert(!/Error:|Exception:|may not have a WebAssembly/.test(output), output);
    console.log(`PASS example ${i + 1}:\n${output.trim()}`);
  }
  await page.locator('.example-shell').first().screenshot({ path: `${artifacts}/demo-desktop.png` });
  await page.screenshot({ path: `${artifacts}/article-desktop.png`, fullPage: true });
  const architecture = page.locator('figure:has(img[src$="/architecture.svg"])');
  await architecture.scrollIntoViewIfNeeded();
  await architecture.locator('img').evaluate(img => img.decode());
  await architecture.screenshot({ path: `${artifacts}/architecture-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await architecture.locator('img').evaluate(img => img.decode());
  await architecture.screenshot({ path: `${artifacts}/architecture-mobile.png` });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal page overflow');
  await page.screenshot({ path: `${artifacts}/article-mobile.png`, fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`PASS browser examples and desktop/mobile layouts. Screenshots: ${artifacts}`);
} catch (error) {
  console.error('Terminal output:', await terminalText());
  console.error('Page errors:', errors);
  await page.screenshot({ path: `${artifacts}/failure.png`, fullPage: true });
  throw error;
} finally {
  clearInterval(progress);
  await browser.close();
}
