import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';

import { handleStripeWebhook, verifyStripeSignature, createCheckout, createPortal, syncLicenses } from '../src/lib/orchard/stripe.ts';
import { defaultDays, handleMeter, instanceMinutes, meterIdentifier, monthToDate } from '../src/lib/orchard/meter.ts';
import { SIZES, hourlyUsd, minuteUnitAmountDecimal, monthlyUsd, FLY_MARKUP } from '../src/lib/orchard/pricing.ts';
import { ORIGIN, env, seedOrg, stubFetch } from './orchard-support.mjs';

for (const level of ['info', 'warn', 'error']) console[level] = () => {};

const WHSEC = 'whsec_test_secret_value';
function signedEvent(event, { secret = WHSEC, timestamp = Math.floor(Date.now() / 1000), raw } = {}) {
  const payload = raw ?? JSON.stringify(event);
  const sig = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  return new Request(`${ORIGIN}/api/stripe/webhook`, { method: 'POST', body: payload, headers: { 'Stripe-Signature': `t=${timestamp},v1=${sig}` } });
}
const SESSION = { uid: 'user_1', email: 'ada@example.com', ev: true, name: 'Ada', org: 'org_1', rt: 'rt', exp: 9e9 };

// ── Pricing ──────────────────────────────────────────────────────────────

test('pricing is Fly list price × 1.35, and per-minute Stripe unit amounts match', () => {
  assert.equal(FLY_MARKUP, 1.35);
  const s = SIZES.find(x => x.id === 's');
  assert.equal(monthlyUsd(s), Math.round(s.flyMonthlyUsd * 135) / 100);
  assert.ok(Math.abs(hourlyUsd(s) * 720 - s.flyMonthlyUsd * 1.35) < 1e-9);
  for (const size of SIZES) {
    // 720 h × 60 min of the per-minute cents equals the monthly price in cents.
    assert.ok(Math.abs(Number(minuteUnitAmountDecimal(size)) * 720 * 60 - size.flyMonthlyUsd * 135) < 0.01, size.id);
  }
});

// ── Webhook signatures ───────────────────────────────────────────────────

test('Stripe signatures: valid, tampered, stale, rotated and malformed', async () => {
  const req = signedEvent({ id: 'evt_1' });
  const bytes = new Uint8Array(await req.arrayBuffer());
  const header = req.headers.get('Stripe-Signature');
  assert.equal(await verifyStripeSignature(bytes, header, WHSEC), true);
  assert.equal(await verifyStripeSignature(bytes, header, 'whsec_other'), false);
  assert.equal(await verifyStripeSignature(bytes, header, WHSEC, Date.now() + 310_000), false);
  assert.equal(await verifyStripeSignature(bytes, header, WHSEC, Date.now() - 310_000), false);
  const [t, v1] = header.split(',');
  assert.equal(await verifyStripeSignature(bytes, `${t},v1=${'0'.repeat(64)},${v1},v0=abc`, WHSEC), true, 'any v1 may match (rotation)');
  assert.equal(await verifyStripeSignature(bytes, `${t},v0=${v1.slice(3)}`, WHSEC), false, 'v0 is never accepted');
  assert.equal(await verifyStripeSignature(bytes, null, WHSEC), false);
  assert.equal(await verifyStripeSignature(bytes, 'garbage', WHSEC), false);
  const tampered = bytes.slice(); tampered[2] ^= 1;
  assert.equal(await verifyStripeSignature(tampered, header, WHSEC), false);
});

test('Stripe’s documented scheme: HMAC keyed by the whole whsec_ string over "t.payload"', async () => {
  // Independent computation, as in Stripe's manual-verification guide.
  const payload = '{"id":"evt_test","object":"event"}';
  const t = 1731705121;
  const expected = createHmac('sha256', WHSEC).update(`${t}.${payload}`).digest('hex');
  assert.equal(await verifyStripeSignature(new TextEncoder().encode(payload), `t=${t},v1=${expected}`, WHSEC, t * 1000), true);
});

// ── Webhook events ───────────────────────────────────────────────────────

const subEvent = (id, created, status, extra = {}) => ({
  id, type: 'customer.subscription.updated', created,
  data: { object: { id: 'sub_1', customer: 'cus_1', status, items: { data: [{ id: 'si_s', price: { id: 'price_s' } }, { id: 'si_lic', price: { id: 'price_license' } }] }, ...extra } },
});

test('webhook records checkout, subscription status (newest wins), payments, and dedupes retries', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB, { billing: 'none', subscription: null });
  const db = e.ORCHARD_DB.sqlite;
  const org = () => db.prepare('SELECT * FROM orgs WHERE id = ?').get('org_1');

  assert.equal((await handleStripeWebhook(signedEvent({ id: 'evt_c', type: 'checkout.session.completed', created: 100,
    data: { object: { client_reference_id: 'org_1', customer: 'cus_1', subscription: 'sub_1', mode: 'subscription' } } }), e)).status, 200);
  assert.equal(org().stripe_subscription_id, 'sub_1');
  assert.equal(org().billing_status, 'active');

  assert.equal((await handleStripeWebhook(signedEvent(subEvent('evt_2', 200, 'past_due')), e)).status, 200);
  assert.equal(org().billing_status, 'past_due');
  assert.equal(org().license_item_id, 'si_lic');
  // An older event delivered late does not roll the status back.
  await handleStripeWebhook(signedEvent(subEvent('evt_1', 150, 'active')), e);
  assert.equal(org().billing_status, 'past_due');
  // A retry of an applied event is acknowledged and ignored.
  const retry = await handleStripeWebhook(signedEvent(subEvent('evt_2', 200, 'past_due')), e);
  assert.deepEqual(await retry.json(), { ok: true, duplicate: true });
  // Another subscription on the same customer is not ours.
  await handleStripeWebhook(signedEvent(subEvent('evt_x', 300, 'canceled', { id: 'sub_other' })), e);
  assert.equal(org().stripe_subscription_id, 'sub_1');
  assert.equal(org().billing_status, 'past_due');

  await handleStripeWebhook(signedEvent({ id: 'evt_del', type: 'customer.subscription.deleted', created: 400, data: { object: { id: 'sub_1', customer: 'cus_1', status: 'canceled' } } }), e);
  assert.equal(org().billing_status, 'canceled');
  await handleStripeWebhook(signedEvent({ id: 'evt_inv', type: 'invoice.payment_failed', created: 401, data: { object: { customer: 'cus_1' } } }), e);
  assert.equal(org().payment_status, 'failed');

  const ignored = await handleStripeWebhook(signedEvent({ id: 'evt_i', type: 'charge.refunded', created: 1, data: { object: {} } }), e);
  assert.deepEqual(await ignored.json(), { ok: true, ignored: true });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM stripe_events').get().n, 6);
});

test('webhook rejects bad signatures and is 503 without configuration', async () => {
  const e = env();
  const forged = signedEvent({ id: 'evt', type: 'invoice.paid', created: 1, data: { object: { customer: 'cus_1' } } }, { secret: 'whsec_wrong' });
  assert.equal((await handleStripeWebhook(forged, e)).status, 400);
  assert.equal((await handleStripeWebhook(signedEvent({}), { ...e, STRIPE_WEBHOOK_SECRET: undefined })).status, 503);
});

// ── Checkout, portal and licenses ────────────────────────────────────────

test('checkout creates the customer once and a subscription session with every metered price', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB, { billing: 'none', customer: null, subscription: null });
  const stripe = stubFetch({
    'POST https://api.stripe.com/v1/customers': () => ({ id: 'cus_new' }),
    'POST https://api.stripe.com/v1/checkout/sessions': () => ({ id: 'cs_1', url: 'https://checkout.stripe.com/c/cs_1' }),
  });
  const response = await createCheckout(e, stripe.fetchImpl, SESSION, ORIGIN, '/products/orchard/console/new?worker=yfinance');
  assert.deepEqual(await response.json(), { ok: true, url: 'https://checkout.stripe.com/c/cs_1' });
  const customer = stripe.find('POST', 'https://api.stripe.com/v1/customers')[0];
  assert.equal(customer.body['metadata[org_id]'], 'org_1');
  assert.equal(customer.headers['Idempotency-Key'], 'orchard-customer-org_1');
  const session = stripe.find('POST', 'https://api.stripe.com/v1/checkout/sessions')[0].body;
  assert.equal(session.mode, 'subscription');
  assert.equal(session.customer, 'cus_new');
  assert.equal(session.client_reference_id, 'org_1');
  assert.deepEqual([session['line_items[0][price]'], session['line_items[1][price]'], session['line_items[2][price]']], ['price_s', 'price_m', 'price_l']);
  assert.equal(session['line_items[0][quantity]'], undefined, 'metered prices take no quantity');
  assert.equal(session.success_url, `${ORIGIN}/products/orchard/console/new?worker=yfinance&billing=done`);
  assert.equal(e.ORCHARD_DB.sqlite.prepare('SELECT stripe_customer_id FROM orgs').get().stripe_customer_id, 'cus_new');

  e.ORCHARD_DB.sqlite.exec("UPDATE orgs SET billing_status = 'active'");
  assert.equal((await createCheckout(e, stripe.fetchImpl, SESSION, ORIGIN, '/')).status, 409);
  assert.equal((await createCheckout({ ...e, STRIPE_PRICE_M: undefined }, stripe.fetchImpl, SESSION, ORIGIN, '/')).status, 503);
});

test('portal needs a customer and returns the Stripe URL', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB);
  const stripe = stubFetch({ 'POST https://api.stripe.com/v1/billing_portal/sessions': () => ({ url: 'https://billing.stripe.com/p/1' }) });
  const response = await createPortal(e, stripe.fetchImpl, SESSION, ORIGIN);
  assert.equal((await response.json()).url, 'https://billing.stripe.com/p/1');
  assert.equal(stripe.calls[0].body.return_url, `${ORIGIN}/products/orchard/console/`);
  e.ORCHARD_DB.sqlite.exec('UPDATE orgs SET stripe_customer_id = NULL');
  assert.equal((await createPortal(e, stripe.fetchImpl, SESSION, ORIGIN)).status, 409);
});

test('license quantity follows live paid deployments', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB);
  const db = e.ORCHARD_DB.sqlite;
  const insert = (id, paid, status) => db.prepare(`INSERT INTO deployments (id, org_id, worker, worker_name, catalog, paid, size, region,
    desired_instances, actual_instances, status, created_at, created_by, updated_at) VALUES (?, 'org_1', 'w', 'W', 'w', ?, 's', 'iad', 1, 1, ?, 'x', 'u', 'x')`).run(id, paid, status);
  insert('dep_a', 1, 'live'); insert('dep_b', 1, 'live'); insert('dep_c', 0, 'live'); insert('dep_d', 1, 'stopped');
  const stripe = stubFetch({
    'POST https://api.stripe.com/v1/subscription_items': ({ url }) => url.endsWith('/subscription_items') ? { id: 'si_lic' } : { id: 'si_lic' },
  });
  assert.equal(await syncLicenses(e, stripe.fetchImpl, 'org_1'), null);
  const created = stripe.calls[0];
  assert.equal(created.url, 'https://api.stripe.com/v1/subscription_items');
  assert.deepEqual([created.body.subscription, created.body.price, created.body.quantity], ['sub_1', 'price_license', '2']);
  insert('dep_e', 1, 'live');
  await syncLicenses(e, stripe.fetchImpl, 'org_1');
  assert.equal(stripe.calls[1].url, 'https://api.stripe.com/v1/subscription_items/si_lic');
  assert.equal(stripe.calls[1].body.quantity, '3');
  const failing = stubFetch({});
  assert.match(await syncLicenses(e, failing.fetchImpl, 'org_1'), /License quantity update failed/);
});

// ── Metering ─────────────────────────────────────────────────────────────

const ev = (deployment_id, instances, occurred_at, org_id = 'org_1', size = 's') => ({ deployment_id, org_id, size, instances, occurred_at });

test('instance-minutes integrate step changes, carry state in from before the window, and stop at zero', () => {
  const start = new Date('2026-11-10T00:00:00Z'), end = new Date('2026-11-11T00:00:00Z');
  const events = [
    ev('dep_a', 2, '2026-11-09T12:00:00Z'),          // 2 instances all of the 10th until 06:00
    ev('dep_a', 3, '2026-11-10T06:00:00Z'),          // 3 from 06:00 to 18:00
    ev('dep_a', 0, '2026-11-10T18:00:00Z'),          // stopped
    ev('dep_b', 1, '2026-11-10T23:30:00Z', 'org_2', 'l'), // 30 minutes
    ev('dep_c', 4, '2026-11-11T01:00:00Z'),          // after the window
  ];
  const totals = instanceMinutes(events, start, end);
  assert.equal(totals.get('org_1|s'), 2 * 360 + 3 * 720);
  assert.equal(totals.get('org_2|l'), 30);
  assert.equal(totals.size, 2);
});

test('defaultDays reports the three complete UTC days before today', () => {
  assert.deepEqual(defaultDays(new Date('2026-11-16T02:15:00Z')), ['2026-11-13', '2026-11-14', '2026-11-15']);
});

function meterRequest(token = 'meter-token-for-tests', body) {
  return new Request(`${ORIGIN}/api/orchard/meter`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

test('meter sends one idempotent Stripe meter event per org, size and day; re-runs never double-bill', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB);
  await seedOrg(e.ORCHARD_DB, { id: 'org_nobill', userId: 'user_2', customer: null, subscription: null });
  const db = e.ORCHARD_DB.sqlite;
  db.exec(`INSERT INTO deployments (id, org_id, worker, worker_name, catalog, size, region, desired_instances, status, created_at, created_by, updated_at)
    VALUES ('dep_a', 'org_1', 'w', 'W', 'w', 'm', 'iad', 2, 'live', 'x', 'u', 'x'),
           ('dep_z', 'org_nobill', 'w', 'W', 'w', 's', 'iad', 1, 'live', 'x', 'u', 'x');
    INSERT INTO deployment_events (deployment_id, org_id, size, instances, occurred_at, actor) VALUES
      ('dep_a', 'org_1', 'm', 2, '2026-11-14T12:00:00.000Z', 'rusty'),
      ('dep_z', 'org_nobill', 's', 1, '2026-11-15T00:00:00.000Z', 'rusty');`);
  const now = new Date('2026-11-16T02:15:00Z');
  const stripe = stubFetch({ 'POST https://api.stripe.com/v2/billing/meter_events': ({ body }) => ({ object: 'v2.billing.meter_event', ...body }) });

  assert.equal((await handleMeter(meterRequest('wrong'), e, stripe.fetchImpl, now)).status, 401);
  assert.equal((await handleMeter(meterRequest(), { ...e, ORCHARD_METER_TOKEN: undefined }, stripe.fetchImpl, now)).status, 503);

  const first = await handleMeter(meterRequest(), e, stripe.fetchImpl, now);
  const result = await first.json();
  assert.equal(first.status, 200);
  assert.deepEqual(result.days, ['2026-11-13', '2026-11-14', '2026-11-15']);
  const sent = stripe.find('POST', 'https://api.stripe.com/v2/billing/meter_events');
  assert.equal(sent.length, 2, 'the 14th (12 h × 2) and the 15th (24 h × 2) for org_1');
  assert.deepEqual(sent.map(c => c.body), [
    { event_name: 'orchard_instance_minutes_m', identifier: meterIdentifier('org_1', 'm', '2026-11-14'), timestamp: '2026-11-14T23:59:59.000Z', payload: { stripe_customer_id: 'cus_1', value: '1440' } },
    { event_name: 'orchard_instance_minutes_m', identifier: meterIdentifier('org_1', 'm', '2026-11-15'), timestamp: '2026-11-15T23:59:59.000Z', payload: { stripe_customer_id: 'cus_1', value: '2880' } },
  ]);
  assert.equal(sent[0].headers['Stripe-Version'], '2026-10-28.endive');
  assert.equal(result.skipped, 1, 'org without a Stripe customer is recorded, not sent');
  assert.equal(db.prepare("SELECT detail FROM meter_reports WHERE org_id = 'org_nobill'").get().detail, 'no_customer');

  // Same run again: nothing new is sent.
  const second = await (await handleMeter(meterRequest(), e, stripe.fetchImpl, now)).json();
  assert.equal(second.already_sent, 2);
  assert.equal(stripe.find('POST', 'https://api.stripe.com/v2/billing/meter_events').length, 2);
});

test('meter treats Stripe duplicate_meter_event as sent, and fails the run on other errors', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB);
  e.ORCHARD_DB.sqlite.exec(`INSERT INTO deployments (id, org_id, worker, worker_name, catalog, size, region, desired_instances, status, created_at, created_by, updated_at)
    VALUES ('dep_a', 'org_1', 'w', 'W', 'w', 's', 'iad', 1, 'live', 'x', 'u', 'x');
    INSERT INTO deployment_events (deployment_id, org_id, size, instances, occurred_at, actor) VALUES ('dep_a', 'org_1', 's', 1, '2026-11-01T00:00:00.000Z', 'r');`);
  const now = new Date('2026-11-16T02:15:00Z');
  const dup = stubFetch({ 'POST https://api.stripe.com/v2/billing/meter_events': () => Response.json({ error: { code: 'duplicate_meter_event' } }, { status: 400 }) });
  const ok = await (await handleMeter(meterRequest('meter-token-for-tests', { days: ['2026-11-15'] }), e, dup.fetchImpl, now)).json();
  assert.equal(ok.sent, 1);
  assert.equal(e.ORCHARD_DB.sqlite.prepare('SELECT status FROM meter_reports').get().status, 'sent');

  const broken = stubFetch({ 'POST https://api.stripe.com/v2/billing/meter_events': () => Response.json({ error: { code: 'no_meter' } }, { status: 400 }) });
  const failed = await handleMeter(meterRequest('meter-token-for-tests', { days: ['2026-11-14', '2026-11-16', '2026-09-01'] }), e, broken.fetchImpl, now);
  assert.equal(failed.status, 502);
  const body = await failed.json();
  assert.equal(body.failed, 1);
  assert.equal(body.reports.find(r => r.day === '2026-11-14').detail, 'stripe_400_no_meter');
  assert.equal(body.reports.find(r => r.day === '2026-11-16').detail, 'outside_window', 'today is incomplete');
  assert.equal(body.reports.find(r => r.day === '2026-09-01').detail, 'outside_window', 'older than Stripe accepts');
  // A failed day is retried next run.
  const retry = await (await handleMeter(meterRequest('meter-token-for-tests', { days: ['2026-11-14'] }), e, dup.fetchImpl, now)).json();
  assert.equal(retry.sent, 1);
});

test('month-to-date minutes cover the current month only', async () => {
  const e = env();
  await seedOrg(e.ORCHARD_DB);
  e.ORCHARD_DB.sqlite.exec(`INSERT INTO deployments (id, org_id, worker, worker_name, catalog, size, region, desired_instances, status, created_at, created_by, updated_at)
    VALUES ('dep_a', 'org_1', 'w', 'W', 'w', 'l', 'iad', 1, 'live', 'x', 'u', 'x');
    INSERT INTO deployment_events (deployment_id, org_id, size, instances, occurred_at, actor) VALUES ('dep_a', 'org_1', 'l', 1, '2026-10-20T00:00:00.000Z', 'r');`);
  const mtd = await monthToDate(e, 'org_1', new Date('2026-11-02T00:00:00Z'));
  assert.deepEqual(mtd, { s: 0, m: 0, l: 1440 });
});
