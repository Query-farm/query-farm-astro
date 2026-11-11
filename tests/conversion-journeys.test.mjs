import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright';
import { build } from 'esbuild';

const browserOptions = { skip: process.env.SKIP_BROWSER_TESTS === 'true' };
const root = new URL('../', import.meta.url).pathname;

test('newsletter native submission and attribution work with intercepted Buttondown and GA', browserOptions, async t => {
  const bundle = await build({ entryPoints: [root + 'src/scripts/newsletter-analytics.ts'], bundle: true, write: false, format: 'iife' });
  const browser = await chromium.launch();
  t.after(() => browser.close());
  async function scenario({ blocked = false, hostname = 'query.farm' } = {}) {
    const context = await browser.newContext();
    const submissions = [];
    // Context-wide interception also covers the first navigation of a popup.
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.hostname === 'buttondown.com' && request.method() === 'POST') {
        submissions.push(new URLSearchParams(request.postData()));
        return route.fulfill({ contentType: 'text/html', body: 'Request received' });
      }
      if (url.hostname === hostname && url.pathname === '/company/newsletter/') return route.fulfill({ contentType: 'text/html', body: `
        <form data-newsletter-form data-newsletter-placement="newsletter_page" action="https://buttondown.com/api/emails/embed-subscribe/queryfarm-dispatch" method="post" target="popupwindow">
          <input type="email" required name="email"><input type="hidden" name="metadata__source" value="site"><button>Subscribe</button>
        </form><a href="/company/newsletter/" id="newsletter-link">Newsletter</a>` });
      return route.abort();
    });
    const page = await context.newPage();
    await page.goto(`https://${hostname}/company/newsletter/?source=duckdb-2-release-activity`);
    await page.evaluate(blocked => {
      window.__conversionEvents = [];
      window.gtag = blocked ? () => { throw Error('Analytics blocked'); } : (...args) => window.__conversionEvents.push(args);
    }, blocked);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    return { context, page, submissions };
  }
  await t.test('invalid forms do not count; a valid request emits only the canonical event and preserves native navigation', async () => {
    const s = await scenario();
    try {
      await s.page.locator('button').click();
      assert.equal(s.submissions.length, 0);
      assert.deepEqual(await s.page.evaluate(() => window.__conversionEvents), []);
      await s.page.locator('[name=email]').fill('private@example.test');
      const [popup] = await Promise.all([s.context.waitForEvent('page'), s.page.locator('button').click()]);
      await popup.waitForLoadState();
      assert.equal(s.submissions.length, 1);
      assert.equal(s.submissions[0].get('metadata__source'), 'duckdb-2-release-activity');
      // A duplicate submit callback must not emit both the legacy and new names.
      await s.page.evaluate(() => document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
      const events = await s.page.evaluate(() => window.__conversionEvents);
      assert.equal(events.length, 1); assert.equal(events[0][1], 'newsletter_submit');
      assert.equal(events[0][2].subscription_status, 'submitted');
      assert.doesNotMatch(JSON.stringify(events), /private@example|newsletter_signup|generate_lead|book_call/);
    } finally { await s.context.close(); }
  });
  await t.test('blocked analytics and preview hosts still submit the form without recording production events', async () => {
    for (const options of [{ blocked: true }, { hostname: 'preview.pages.dev' }]) {
      const s = await scenario(options);
      try {
        await s.page.locator('[name=email]').fill('private@example.test');
        const [popup] = await Promise.all([s.context.waitForEvent('page'), s.page.locator('button').click()]);
        await popup.waitForLoadState();
        assert.equal(s.submissions.length, 1);
        assert.equal(s.submissions[0].get('metadata__source'), 'duckdb-2-release-activity');
        assert.deepEqual(await s.page.evaluate(() => window.__conversionEvents), []);
      } finally { await s.context.close(); }
    }
  });
  await t.test('newsletter navigation is only an interest event and carries safe attribution', async () => {
    const s = await scenario();
    try {
      await s.page.evaluate(() => {
        const link = document.querySelector('#newsletter-link');
        link.addEventListener('click', e => e.preventDefault());
        link.click();
      });
      assert.match(await s.page.locator('#newsletter-link').getAttribute('href'), /source=duckdb-2-release-activity/);
      assert.deepEqual((await s.page.evaluate(() => window.__conversionEvents)).map(e => e[1]), ['newsletter_click']);
    } finally { await s.context.close(); }
  });
});

test('the actual scheduling page script queues tracking before the provider loads', browserOptions, async t => {
  const path = root + 'src/pages/company/schedule.astro';
  const script = readFileSync(path, 'utf8').match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'Keep this integration test connected to the schedule page script');
  const bundle = await build({ stdin: { contents: script, loader: 'ts', resolveDir: dirname(path) }, bundle: true, write: false, format: 'iife' });
  const browser = await chromium.launch(); t.after(() => browser.close());
  const context = await browser.newContext();
  const requests = [];
  await context.route('**/*', async route => {
    const url = new URL(route.request().url()); requests.push(url.href);
    if (url.href === 'https://query.farm/company/schedule/') return route.fulfill({ contentType: 'text/html', body:
      '<div id="cal-inline" data-cal-link="queryfarm"></div><a data-booking-fallback href="https://cal.com/queryfarm" target="_blank">Open scheduler</a>' });
    if (url.href === 'https://app.cal.com/embed/embed.js') return route.fulfill({ contentType: 'application/javascript', body: `
      window.calCallbacks = {}; window.calOptions = {};
      const queue = Cal.ns.schedule.q;
      Cal.ns.schedule = (command, options) => {
        if(command === 'on') window.calCallbacks[options.action] = options.callback;
        else window.calOptions[command] = options;
      };
      queue.forEach(args => Cal.ns.schedule(...args));
    ` });
    if (url.href === 'https://cal.com/queryfarm') return route.fulfill({ contentType: 'text/html', body: 'Direct scheduler' });
    return route.abort();
  });
  const page = await context.newPage(); await page.goto('https://query.farm/company/schedule/');
  await page.evaluate(() => { window.__conversionEvents = []; window.gtag = (...args) => window.__conversionEvents.push(args); });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.waitForFunction(() => window.calCallbacks?.bookingSuccessfulV2);
  assert.equal(await page.evaluate(() => window.calOptions.inline.calLink), 'queryfarm');
  await page.evaluate(() => {
    window.calCallbacks.linkReady(); window.calCallbacks.eventTypeSelected();
    const data = { uid: 'booking-one', status: 'PENDING', paymentRequired: false, email: 'private@example.test' };
    window.calCallbacks.bookingSuccessfulV2({ detail: { data } });
    data.status = 'ACCEPTED';
    window.calCallbacks.bookingSuccessfulV2({ detail: { data } });
    window.calCallbacks.bookingSuccessfulV2({ detail: { data } });
  });
  const [popup] = await Promise.all([context.waitForEvent('page'), page.locator('[data-booking-fallback]').click()]);
  await popup.waitForLoadState();
  const events = await page.evaluate(() => window.__conversionEvents);
  assert.deepEqual(events.map(e => e[1]), ['booking_ready', 'booking_start', 'booking_requested', 'book_call', 'booking_external_click']);
  assert.doesNotMatch(JSON.stringify(events), /booking-one|private@example/);
  assert.equal(requests.filter(url => url.includes('embed.js')).length, 1);
  await context.close();
});
