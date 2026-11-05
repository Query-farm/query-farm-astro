import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium } from 'playwright';
import { build } from 'esbuild';
import { trackEnquiry } from '../src/lib/enquiry-tracking.ts';

const ENQUIRY = '11111111-1111-4111-8111-111111111111';
const fixture = `<!doctype html><form data-enquiry-form novalidate>
  <input name="name"><p data-error-for="name" hidden></p>
  <input name="email"><p data-error-for="email" hidden></p>
  <input name="company"><input name="topic" value="Consulting">
  <textarea name="message"></textarea><p data-error-for="message" hidden></p>
  <input name="qf_hp"><input name="cf-turnstile-response" value="test-token">
  <div class="cf-turnstile"></div><button type="submit">Send message</button>
  <button type="button" data-enquiry-retry hidden>Try the security check again</button>
  <p data-enquiry-status></p></form><div data-enquiry-sent hidden tabindex="-1">Accepted</div>`;

test('contact funnel and retry behavior in Chromium, with every request intercepted', async t => {
  const bundle = await build({ entryPoints: [new URL('../src/lib/enquiry-form.ts', import.meta.url).pathname], bundle: true, write: false, format: 'iife', globalName: 'EnquiryClient' });
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  async function scenario(response) {
    const page = await browser.newPage();
    const requests = [];
    // No real website, challenge, email or GA requests can escape this route.
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/api/enquiry') {
        requests.push(route.request().postDataJSON());
        if (response.abort) return route.abort();
        return route.fulfill({ status: response.status ?? 200, contentType: 'application/json', body: response.raw ?? JSON.stringify(response.body) });
      }
      if (url.origin === 'https://query.farm' && url.pathname === '/company/contact/') return route.fulfill({ contentType: 'text/html', body: fixture });
      return route.abort();
    });
    await page.goto('https://query.farm/company/contact/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.evaluate(() => {
      window.events = []; window.resets = 0;
      window.gtag = (...args) => window.events.push(args);
      window.turnstile = { reset: () => { window.resets++; } };
      window.EnquiryClient.initEnquiryForms();
      window.EnquiryClient.initEnquiryForms(); // Reinitialization must not duplicate listeners.
    });
    await page.locator('[name=name]').fill('Private Name');
    await page.locator('[name=email]').fill('private@example.com');
    await page.locator('[name=message]').fill('Private enquiry contents');
    const submit = async () => {
      await page.locator('button[type=submit]').click();
      await page.waitForFunction(() => document.querySelector('[data-enquiry-status]').textContent !== 'Sending…' || document.querySelector('[data-enquiry-form]').hidden);
    };
    const state = () => page.evaluate(() => ({
      events: window.events, resets: window.resets,
      hidden: document.querySelector('[data-enquiry-form]').hidden,
      sent: !document.querySelector('[data-enquiry-sent]').hidden,
      message: document.querySelector('[data-enquiry-status]').textContent,
      retry: !document.querySelector('[data-enquiry-retry]').hidden,
      text: document.querySelector('[name=message]').value,
    }));
    const widget = state => page.evaluate(value => {
      const form = document.querySelector('[data-enquiry-form]');
      form.dataset.turnstileStatus = value;
      form.dispatchEvent(new Event('enquiry:turnstile'));
    }, state);
    return { page, requests, submit, state, widget };
  }
  await t.test('accepted lead emits one conversion without exposing form values or provider IDs', async () => {
    const s = await scenario({ body: { ok: true, accepted: true, enquiry_id: ENQUIRY, resend_id: 'private-provider-id' } });
    try {
      await s.submit();
      await s.widget('error'); // No late widget error after a completed form.
      await s.page.evaluate(() => document.querySelector('[data-enquiry-form]').dispatchEvent(new Event('submit', { cancelable: true })));
      const state = await s.state();
      assert.deepEqual(state.events.map(e => e[1]), ['enquiry_start', 'enquiry_submit', 'enquiry_accepted', 'generate_lead']);
      assert.equal(state.hidden, true); assert.equal(state.sent, true); assert.equal(state.resets, 0);
      assert.equal(state.events[3][2].enquiry_id, ENQUIRY);
      assert.equal(state.events[3][2].topic, 'Consulting');
      assert.doesNotMatch(JSON.stringify(state.events), /Private|private@example|private-provider/);
      assert.equal(s.requests.length, 1);
    } finally { await s.page.close(); }
  });
  await t.test('honeypot acknowledgement shows quiet success without a lead or accepted event', async () => {
    const s = await scenario({ body: { ok: true, accepted: false } });
    try {
      await s.page.locator('[name=qf_hp]').fill('spam');
      await s.submit(); const state = await s.state();
      assert.equal(state.sent, true);
      assert.deepEqual(state.events.map(e => e[1]), ['enquiry_start', 'enquiry_submit']);
    } finally { await s.page.close(); }
  });
  await t.test('field validation preserves inputs and the unused challenge token', async () => {
    const s = await scenario({ status: 400, body: { ok: false, reason: 'validation', enquiry_id: ENQUIRY, error: 'Check the highlighted fields.', errors: { email: 'Enter an email address.' } } });
    try {
      await s.submit(); const state = await s.state();
      assert.equal(state.hidden, false); assert.equal(state.sent, false); assert.equal(state.resets, 0);
      assert.equal(state.text, 'Private enquiry contents');
      assert.equal(await s.page.locator('[name=email]').getAttribute('aria-invalid'), 'true');
      assert.equal(state.events.at(-1)[2].reason, 'validation');
    } finally { await s.page.close(); }
  });
  await t.test('security retry keeps the message and only clears widget-owned status when ready', async () => {
    const s = await scenario({ status: 403, body: { ok: false, reason: 'turnstile_expired', error: 'Security check expired.' } });
    try {
      await s.submit(); const initial = await s.state();
      assert.equal(initial.retry, true); assert.equal(initial.resets, 1);
      assert.equal(initial.events.at(-1)[2].reason, 'turnstile_expired');
      await s.page.locator('[data-enquiry-retry]').click(); await s.widget('ready');
      const state = await s.state();
      assert.equal(state.text, 'Private enquiry contents'); assert.equal(state.resets, 2);
      assert.equal(state.message, ''); assert.equal(state.sent, false);
    } finally { await s.page.close(); }
  });
  await t.test('send failures remain visible after Turnstile becomes ready again', async () => {
    const message = 'We could not confirm your message was sent. Please email hello@query.farm instead.';
    const s = await scenario({ status: 502, body: { ok: false, reason: 'send_failed', error: message } });
    try {
      await s.submit(); await s.widget('ready');
      const state = await s.state();
      assert.equal(state.message, message); assert.equal(state.sent, false);
      assert.deepEqual(state.events.map(e => e[1]), ['enquiry_start', 'enquiry_submit', 'enquiry_error']);
      assert.equal(state.events.at(-1)[2].reason, 'send_failed');
    } finally { await s.page.close(); }
  });
  await t.test('network and malformed responses have distinct safe failure reasons', async () => {
    for (const [response, reason] of [[{ abort: true }, 'network'], [{ raw: '<html>Not JSON</html>' }, 'unexpected_response'], [{ body: { ok: false, reason: 'private@example.com' } }, 'unexpected_response']]) {
      const s = await scenario(response);
      try {
        await s.submit(); await s.widget('ready'); const state = await s.state();
        assert.equal(state.events.at(-1)[2].reason, reason);
        assert.match(state.message, /hello@query.farm/); assert.equal(state.sent, false);
      } finally { await s.page.close(); }
    }
  });
  await t.test('analytics failure cannot change an accepted send into a form error', async () => {
    const s = await scenario({ body: { ok: true, accepted: true, enquiry_id: ENQUIRY } });
    try {
      await s.page.evaluate(() => { window.gtag = () => { throw Error('Analytics failed'); }; });
      await s.submit(); assert.equal((await s.state()).sent, true);
    } finally { await s.page.close(); }
  });
});

test('custom analytics only runs on the production hosts and filters arbitrary values', () => {
  const calls = [];
  const runtime = { location: { hostname: 'localhost' }, gtag: (...args) => calls.push(args) };
  assert.equal(trackEnquiry('enquiry_error', { reason: 'validation' }, runtime), false);
  runtime.location.hostname = 'query.farm';
  assert.equal(trackEnquiry('enquiry_error', { reason: 'private@example.com', enquiry_id: 'private@example.com', topic: 'private@example.com', email: 'private@example.com', resend_id: 'secret' }, runtime), true);
  assert.deepEqual(calls, [['event', 'enquiry_error', { form_id: 'enquiry', reason: 'unexpected_response', transport_type: 'beacon' }]]);
});
