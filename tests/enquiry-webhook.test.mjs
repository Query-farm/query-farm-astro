import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { handleEnquiryWebhook, verifyResendWebhook } from '../src/lib/enquiry-webhook.ts';
import { saveEnquiryReceipt } from '../src/lib/enquiry-store.ts';
import { enquiryDatabase } from './enquiry-support.mjs';

const SECRET = 'whsec_' + Buffer.from('local-test-signing-secret-32bytes!').toString('base64');
const ENQUIRY = '11111111-1111-4111-8111-111111111111';
const EMAIL = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
const DATE = '2026-11-04T20:00:00.000Z';
function event(type = 'email.delivered', overrides = {}) {
  return { type, created_at: DATE, data: { created_at: DATE, email_id: EMAIL, from: 'website@query.farm', to: ['private@example.com'], subject: 'Private enquiry from someone', tags: { source: 'website_enquiry', enquiry_id: ENQUIRY } }, ...overrides };
}
function signed(body, { id = 'msg_test', timestamp = Math.floor(Date.now() / 1000), signature, raw } = {}) {
  const payload = raw ?? JSON.stringify(body);
  const digest = createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${timestamp}.${payload}`).digest('base64');
  return new Request('https://query.farm/api/enquiry-delivery', { method: 'POST', body: payload, headers: {
    'svix-id': id, 'svix-timestamp': String(timestamp), 'svix-signature': signature ?? `v1,${digest}`,
  } });
}

test('verification matches Svix’s independent published vector', async () => {
  const bytes = new TextEncoder().encode('{"event_type":"ping","data":{"success":true}}');
  const headers = new Headers({ 'svix-id': 'msg_loFOjxBNrRLzqYUf', 'svix-timestamp': '1731705121', 'svix-signature': 'v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=' });
  assert.equal(await verifyResendWebhook(bytes, headers, 'whsec_plJ3nmyCDGBKInavdOK15jsl', 1731705121000), true);
  assert.equal(await verifyResendWebhook(new TextEncoder().encode('{"event_type": "ping","data":{"success":true}}'), headers, 'whsec_plJ3nmyCDGBKInavdOK15jsl', 1731705121000), false);
});

test('raw bytes, timestamp tolerance and signature rotation are enforced', async () => {
  const req = signed(event());
  const bytes = new Uint8Array(await req.arrayBuffer());
  assert.equal(await verifyResendWebhook(bytes, req.headers, SECRET), true);
  assert.equal(await verifyResendWebhook(bytes, req.headers, SECRET, Date.now() + 301_000), false);
  assert.equal(await verifyResendWebhook(bytes, req.headers, SECRET, Date.now() - 301_000), false);
  const rotated = new Headers(req.headers);
  rotated.set('svix-signature', 'v1,bad! v2,ignored ' + req.headers.get('svix-signature'));
  assert.equal(await verifyResendWebhook(bytes, rotated, SECRET), true);
  bytes[bytes.length - 2] ^= 1;
  assert.equal(await verifyResendWebhook(bytes, req.headers, SECRET), false);
  assert.equal(await verifyResendWebhook(bytes, req.headers, 'not-a-secret'), false);
});

test('delivery receipts recover webhook-before-send races and deduplicate retries atomically', async () => {
  const db = enquiryDatabase();
  const env = { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET };
  try {
    assert.equal((await handleEnquiryWebhook(signed(event()), env)).status, 200);
    assert.equal((await handleEnquiryWebhook(signed(event()), env)).status, 200);
    await saveEnquiryReceipt(db, { enquiryId: ENQUIRY, resendId: EMAIL, acceptedAt: DATE });
    const receipts = db.sqlite.prepare('SELECT * FROM enquiry_messages').all();
    const events = db.sqlite.prepare('SELECT * FROM enquiry_delivery_events').all();
    assert.equal(receipts.length, 1);
    assert.equal(events.length, 1);
    assert.equal(receipts[0].enquiry_id, ENQUIRY);
    assert.equal(events[0].event_type, 'email.delivered');
    assert.doesNotMatch(JSON.stringify({ receipts, events }), /private@example|Private enquiry|website@query/);
  } finally { db.sqlite.close(); }
});

test('out-of-order delivery events preserve event time and complete history', async () => {
  const db = enquiryDatabase();
  const env = { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET };
  try {
    await handleEnquiryWebhook(signed(event('email.delivered', { created_at: '2026-11-04T20:02:00Z' }), { id: 'msg_delivered' }), env);
    await handleEnquiryWebhook(signed(event('email.delivery_delayed', { created_at: '2026-11-04T20:01:00Z' }), { id: 'msg_delayed' }), env);
    await handleEnquiryWebhook(signed(event('email.sent'), { id: 'msg_sent' }), env);
    assert.deepEqual(db.sqlite.prepare('SELECT event_type FROM enquiry_delivery_events ORDER BY occurred_at DESC').all().map(r => r.event_type), ['email.delivered', 'email.delivery_delayed', 'email.sent']);
  } finally { db.sqlite.close(); }
});

test('unsupported and unrelated emails are ignored without storing personal data', async () => {
  const db = enquiryDatabase();
  const env = { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET };
  try {
    const unrelated = event(); delete unrelated.data.tags;
    for (const value of [unrelated, event('email.opened')]) {
      const response = await handleEnquiryWebhook(signed(value), env);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).ignored, true);
    }
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM enquiry_messages').get().count, 0);
  } finally { db.sqlite.close(); }
});

test('an existing receipt allows signed events without tags', async () => {
  const db = enquiryDatabase();
  try {
    await saveEnquiryReceipt(db, { enquiryId: ENQUIRY, resendId: EMAIL, acceptedAt: DATE });
    const payload = event('email.bounced'); delete payload.data.tags;
    assert.equal((await handleEnquiryWebhook(signed(payload), { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET })).status, 200);
    assert.equal(db.sqlite.prepare('SELECT event_type FROM enquiry_delivery_events').get().event_type, 'email.bounced');
  } finally { db.sqlite.close(); }
});

test('invalid signature, stale replay and malformed signed JSON never write records', async () => {
  const db = enquiryDatabase();
  const env = { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET };
  try {
    for (const [request, status] of [
      [signed(event(), { signature: 'v1,invalid' }), 401],
      [signed(event(), { timestamp: Math.floor(Date.now() / 1000) - 600 }), 401],
      [signed(null, { raw: '{broken' }), 400],
      [signed(null), 400],
      [signed(event(), { raw: 'x'.repeat(65537) }), 413],
    ]) assert.equal((await handleEnquiryWebhook(request, env)).status, status);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM enquiry_messages').get().count, 0);
  } finally { db.sqlite.close(); }
});

test('missing configuration and storage failure return retryable failures', async () => {
  assert.equal((await handleEnquiryWebhook(signed(event()), {})).status, 503);
  const failing = { prepare: () => { throw Error('storage unavailable'); } };
  assert.equal((await handleEnquiryWebhook(signed(event()), { ENQUIRY_DB: failing, RESEND_WEBHOOK_SECRET: SECRET })).status, 503);
});

test('a failed transaction rolls back receipt insertion and a later retry can succeed', async () => {
  const db = enquiryDatabase();
  const env = { ENQUIRY_DB: db, RESEND_WEBHOOK_SECRET: SECRET };
  try {
    db.sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON enquiry_delivery_events BEGIN SELECT RAISE(ABORT, 'test outage'); END");
    assert.equal((await handleEnquiryWebhook(signed(event()), env)).status, 503);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM enquiry_messages').get().count, 0);
    db.sqlite.exec('DROP TRIGGER fail_event');
    assert.equal((await handleEnquiryWebhook(signed(event()), env)).status, 200);
    assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM enquiry_delivery_events').get().count, 1);
  } finally { db.sqlite.close(); }
});
