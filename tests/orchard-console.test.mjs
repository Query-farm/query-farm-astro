import assert from 'node:assert/strict';
import test from 'node:test';

import { handleOrchardApi, attachSnippet } from '../src/lib/orchard/api.ts';
import { RESEND, env, req, seedOrg, sessionHeader, stubFetch } from './orchard-support.mjs';

for (const level of ['info', 'warn', 'error']) console[level] = () => {};

async function setup({ billing = 'active' } = {}) {
  const e = env();
  await seedOrg(e.ORCHARD_DB, { billing });
  const user = await sessionHeader();
  const admin = await sessionHeader({ uid: 'user_rusty', email: 'rusty@query.farm', org: 'org_qf' });
  const outsider = await sessionHeader({ uid: 'user_eve', email: 'eve@example.com', org: 'org_eve' });
  const fetches = stubFetch({ ...RESEND, 'POST https://api.stripe.com/v1/subscription_items': () => ({ id: 'si_lic' }) });
  const call = async (path, opts) => {
    const response = await handleOrchardApi(req(path, opts), e, fetches.fetchImpl);
    return { status: response.status, body: await response.json() };
  };
  return { e, db: e.ORCHARD_DB.sqlite, user, admin, outsider, fetches, call };
}

const NEW = { worker: 'yfinance', size: 'm', instances: 2, region: 'iad' };

test('signed-out callers get 401, and the console is 503 without a database', async () => {
  const { call, e } = await setup();
  assert.equal((await call('/api/orchard/me')).status, 401);
  assert.equal((await call('/api/orchard/deployments')).body.reason, 'signed_out');
  const response = await handleOrchardApi(req('/api/orchard/me'), { ...e, ORCHARD_DB: undefined });
  assert.equal(response.status, 503);
});

test('me reports the user, org, billing and admin flag', async () => {
  const { call, user, admin } = await setup();
  const me = (await call('/api/orchard/me', { cookie: user })).body;
  assert.deepEqual(me.org, { id: 'org_1', name: 'example.com' });
  assert.equal(me.billing.active, true);
  assert.equal(me.billing.configured, true);
  assert.equal(me.admin, false);
  assert.equal((await call('/api/orchard/me', { cookie: admin })).body.admin, true);
});

test('creating a deployment validates input, needs billing, and files a create request with an email', async () => {
  const { call, user, db, fetches } = await setup({ billing: 'none' });
  const invalid = await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: { worker: 'nope', size: 'xl', instances: 0, region: 'mars' } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys(invalid.body.errors).sort(), ['instances', 'region', 'size', 'worker']);

  const unpaid = await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: NEW });
  assert.equal(unpaid.status, 402);
  assert.equal(unpaid.body.reason, 'billing_required');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deployments').get().n, 0);

  db.exec("UPDATE orgs SET billing_status = 'active'");
  const created = await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: { ...NEW, worker: 'premium' } });
  assert.equal(created.status, 201);
  const d = created.body.deployment;
  assert.match(d.id, /^dep_/);
  assert.equal(d.status, 'requested');
  assert.equal(d.paid, true);
  assert.equal(d.version, 'v1.0.0');
  assert.equal(d.attachSql, null, 'no endpoint yet');
  const request = db.prepare('SELECT * FROM requests').get();
  assert.deepEqual([request.kind, request.status, request.desired_instances], ['create', 'new', 2]);
  const email = fetches.find('POST', 'https://api.resend.com/emails')[0].body;
  assert.match(email.subject, /Orchard create request: Premium Data × 2 \(M, iad\)/);
  assert.match(email.text, /fly --vm-size shared-cpu-2x/);
});

test('cross-origin writes are refused', async () => {
  const { call, user } = await setup();
  const response = await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: NEW, headers: { Origin: 'https://evil.example' } });
  assert.equal(response.status, 403);
});

test('the full journey: create → admin provisions → scale requests fold → admin scales → stop; events drive usage', async () => {
  const { call, user, admin, outsider, db, fetches } = await setup();
  const { deployment } = (await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: NEW })).body;
  const id = deployment.id;

  // Other orgs can't see or touch it; non-admins can't reach the tracker.
  assert.equal((await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: outsider, body: { delta: 1 } })).status, 404);
  assert.equal((await call('/api/orchard/deployments', { cookie: outsider })).body.deployments.length, 0);
  assert.equal((await call('/api/orchard/admin/requests', { cookie: user })).status, 403);

  // + before it's live folds into the pending create request.
  const folded = await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: 1 } });
  assert.equal(folded.body.folded, true);
  assert.equal(db.prepare('SELECT desired_instances FROM requests').get().desired_instances, 3);

  // The tracker.
  const tracker = (await call('/api/orchard/admin/requests', { cookie: admin })).body.requests;
  assert.equal(tracker.length, 1);
  assert.equal(tracker[0].org_name, 'example.com');
  assert.equal(tracker[0].requester_email, 'ada@example.com');
  const reqId = tracker[0].id;

  assert.equal((await call(`/api/orchard/admin/requests/${reqId}`, { method: 'POST', cookie: admin, body: { status: 'in_progress' } })).status, 200);
  assert.equal(db.prepare('SELECT status FROM deployments').get().status, 'provisioning');
  // Done needs an https endpoint.
  assert.equal((await call(`/api/orchard/admin/requests/${reqId}`, { method: 'POST', cookie: admin, body: { status: 'done' } })).status, 400);
  assert.equal((await call(`/api/orchard/admin/requests/${reqId}`, { method: 'POST', cookie: admin, body: { status: 'done', endpoint: 'http://insecure' } })).status, 400);
  const done = await call(`/api/orchard/admin/requests/${reqId}`, { method: 'POST', cookie: admin, body: { status: 'done', endpoint: 'https://qf-org1-yfinance.fly.dev', instances: 3 } });
  assert.equal(done.body.status, 'live');
  assert.equal(done.body.instances, 3);
  assert.match(done.body.gate.secret, /^qfg_/, 'the gate secret is minted when first live');
  assert.equal((await call(`/api/orchard/admin/requests/${reqId}`, { method: 'POST', cookie: admin, body: { status: 'done' } })).status, 409, 'already done');

  const listed = (await call('/api/orchard/deployments', { cookie: user })).body;
  const live = listed.deployments[0];
  assert.equal(live.status, 'live');
  assert.equal(live.actualInstances, 3);
  assert.equal(live.attachSql, "ATTACH 'yfinance' AS yfinance (\n  TYPE vgi,\n  LOCATION 'https://qf-org1-yfinance.fly.dev'\n);");
  assert.doesNotMatch(live.attachSql, /SECRET|TOKEN|sk_/i);

  // Two − clicks on a live deployment: one new scale request, folded.
  const s1 = await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: -1 } });
  const s2 = await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: -1 } });
  assert.equal(s1.body.folded, false);
  assert.equal(s2.body.folded, true);
  assert.equal(s2.body.request_id, s1.body.request_id);
  assert.equal(s2.body.desired_instances, 1);
  assert.equal((await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: -1 } })).status, 400, 'never below 1');
  assert.equal((await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: 5 } })).status, 400);
  assert.equal(fetches.find('POST', 'https://api.resend.com/emails').length, 2, 'create + first scale; folded clicks send nothing');

  await call(`/api/orchard/admin/requests/${s1.body.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done' } });
  assert.equal(db.prepare('SELECT actual_instances FROM deployments').get().actual_instances, 1);

  const stop = await call(`/api/orchard/deployments/${id}/stop`, { method: 'POST', cookie: user });
  await call(`/api/orchard/admin/requests/${stop.body.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done' } });
  assert.equal(db.prepare('SELECT status FROM deployments').get().status, 'stopped');
  assert.equal((await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: 1 } })).status, 409);

  const events = db.prepare('SELECT instances, size, actor FROM deployment_events ORDER BY id').all();
  assert.deepEqual(events.map(e => e.instances), [3, 1, 0]);
  assert.ok(events.every(e => e.size === 'm' && e.actor === 'rusty@query.farm'));
  const mtd = (await call('/api/orchard/deployments', { cookie: user })).body.monthToDate;
  assert.equal(typeof mtd.usageUsd, 'number');
  assert.equal(mtd.licenseMonthlyUsd, 0);
});

test('fulfilling a paid worker syncs the license quantity; rejecting a create closes the deployment', async () => {
  const { call, user, admin, db, fetches } = await setup();
  const paid = (await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: { ...NEW, worker: 'premium' } })).body;
  const rejectMe = (await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: NEW })).body;
  await call(`/api/orchard/admin/requests/${paid.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done', endpoint: 'https://p.fly.dev' } });
  const license = fetches.find('POST', 'https://api.stripe.com/v1/subscription_items')[0];
  assert.deepEqual([license.body.price, license.body.quantity], ['price_license', '1']);
  assert.equal((await call('/api/orchard/deployments', { cookie: user })).body.monthToDate.licenseMonthlyUsd, 49);

  await call(`/api/orchard/admin/requests/${rejectMe.request_id}`, { method: 'POST', cookie: admin, body: { status: 'rejected', note: 'Region unavailable' } });
  const row = db.prepare('SELECT status, desired_instances FROM deployments WHERE id = ?').get(rejectMe.deployment.id);
  assert.deepEqual({ ...row }, { status: 'rejected', desired_instances: 0 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deployment_events').get().n, 1, 'rejections write no usage');
  assert.equal((await call(`/api/orchard/admin/requests/${rejectMe.request_id}`, { method: 'POST', cookie: admin, body: { status: 'bogus' } })).status, 409);
});

test('billing routes hand back Stripe URLs', async () => {
  const { e, user } = await setup({ billing: 'none' });
  const stripe = stubFetch({ 'POST https://api.stripe.com/v1/checkout/sessions': () => ({ url: 'https://checkout.stripe.com/x' }) });
  const response = await handleOrchardApi(req('/api/orchard/billing/checkout', { method: 'POST', cookie: user, body: { return_to: '//evil.com' } }), e, stripe.fetchImpl);
  assert.equal((await response.json()).url, 'https://checkout.stripe.com/x');
  assert.equal(stripe.calls[0].body.success_url, 'https://query.farm/products/orchard/console/?billing=done');
});

test('attach snippets quote safely and are absent without an endpoint', () => {
  assert.equal(attachSnippet({ catalog: 'x', endpoint: null }), null);
  assert.match(attachSnippet({ catalog: 'x', endpoint: "https://a.dev/it's" }), /LOCATION 'https:\/\/a\.dev\/it''s'/);
});

test('unknown routes are 404', async () => {
  const { call, user } = await setup();
  assert.equal((await call('/api/orchard/nope', { cookie: user })).status, 404);
  assert.equal((await call('/api/orchard/deployments/not-an-id/scale', { method: 'POST', cookie: user, body: { delta: 1 } })).status, 404);
});
