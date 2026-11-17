import assert from 'node:assert/strict';
import test from 'node:test';

import { handleOrchardApi } from '../src/lib/orchard/api.ts';
import { flyApp, sha256Hex } from '../src/lib/orchard/gate.ts';
import { RESEND, env, req, seedOrg, sessionHeader, stubFetch } from './orchard-support.mjs';

for (const level of ['info', 'warn', 'error']) console[level] = () => {};

async function liveDeployment(overrides = {}) {
  const e = env({ WORKOS_AUTHKIT_DOMAIN: 'https://utter-fork-33-staging.authkit.app', WORKOS_VGI_CLIENT_ID: 'client_vgi', WORKOS_CLIENT_ID: 'client_site', ...overrides });
  await seedOrg(e.ORCHARD_DB);
  const user = await sessionHeader();
  const admin = await sessionHeader({ uid: 'user_rusty', email: 'rusty@query.farm', org: 'org_qf' });
  const fetches = stubFetch({ ...RESEND });
  const call = async (path, opts) => {
    const response = await handleOrchardApi(req(path, opts), e, fetches.fetchImpl);
    return { status: response.status, headers: response.headers, body: await response.json() };
  };
  const created = (await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: { worker: 'yfinance', size: 's', instances: 1, region: 'iad' } })).body;
  const done = await call(`/api/orchard/admin/requests/${created.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done', endpoint: 'https://qf-acme-yfinance.fly.dev' } });
  return { e, db: e.ORCHARD_DB.sqlite, call, user, admin, id: created.deployment.id, gate: done.body.gate };
}

const allowlist = (call, id, secret) => call(`/api/orchard/gate/deployments/${id}/allowlist`, secret === undefined ? {} : { headers: { Authorization: `Bearer ${secret}` } });

test('marking a deployment live mints a gate secret, stores only its hash, and prints the Fly setup', async () => {
  const { db, id, gate } = await liveDeployment();
  assert.match(gate.secret, /^qfg_[A-Za-z0-9_-]{43}$/);
  const stored = db.prepare('SELECT gate_secret_hash FROM deployments WHERE id = ?').get(id).gate_secret_hash;
  assert.equal(stored, await sha256Hex(gate.secret));
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM deployments').all()).includes(gate.secret), 'the secret itself is never stored');
  assert.equal(gate.setup, [
    '# fly.toml',
    '[env]',
    `  GATE_UPSTREAM = "http://127.0.0.1:8000"  # the worker's --http listener in the same Machine`,
    '  GATE_RESOURCE = "https://qf-acme-yfinance.fly.dev"',
    '  GATE_AUTH_SERVER = "https://utter-fork-33-staging.authkit.app"',
    '  GATE_CLIENT_ID = "client_vgi"',
    '  GATE_AUDIENCE = "client_site"',
    '  GATE_AUTHZ = "allowlist"',
    `  GATE_ALLOWLIST_URL = "https://query.farm/api/orchard/gate/deployments/${id}/allowlist"`,
    '',
    `fly secrets set GATE_DEPLOYMENT_SECRET=${gate.secret} --app qf-acme-yfinance`,
  ].join('\n'));
});

test('the allow-list needs the deployment’s own secret: missing, wrong, another deployment’s, right', async () => {
  const { call, id, gate, user, admin } = await liveDeployment();
  const missing = await allowlist(call, id);
  assert.equal(missing.status, 401);
  assert.equal(missing.headers.get('WWW-Authenticate'), 'Bearer');
  assert.equal((await allowlist(call, id, '')).status, 401);
  assert.equal((await allowlist(call, id, `${gate.secret}x`)).status, 401);
  assert.equal((await allowlist(call, id, 'qfg_wrong')).status, 401);
  assert.equal((await allowlist(call, 'dep_00000000-0000-4000-8000-000000000000', gate.secret)).status, 401, 'unknown deployment looks the same');
  // A second deployment's secret doesn't open the first.
  const other = (await call('/api/orchard/deployments', { method: 'POST', cookie: user, body: { worker: 'yfinance', size: 's', instances: 1, region: 'iad' } })).body;
  const otherGate = (await call(`/api/orchard/admin/requests/${other.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done', endpoint: 'https://b.fly.dev' } })).body.gate;
  assert.equal((await allowlist(call, id, otherGate.secret)).status, 401);

  const ok = await allowlist(call, id, gate.secret);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body, { deployment_id: id, allowed_subs: ['user_1'] });
  assert.equal(ok.headers.get('Cache-Control'), 'no-store');
  assert.equal((await call(`/api/orchard/gate/deployments/${id}/allowlist`, { method: 'POST', headers: { Authorization: `Bearer ${gate.secret}` } })).status, 405);
});

test('membership changes show up in the allow-list; stopped deployments admit nobody', async () => {
  const { call, db, id, gate, user, admin } = await liveDeployment();
  db.exec(`INSERT INTO members (org_id, user_id, email, created_at) VALUES ('org_1', 'user_2', 'grace@example.com', 'x');
    INSERT INTO orgs (id, name, created_at, created_by) VALUES ('org_other', 'Other', 'x', 'user_9');
    INSERT INTO members (org_id, user_id, email, created_at) VALUES ('org_other', 'user_9', 'eve@example.com', 'x');`);
  assert.deepEqual((await allowlist(call, id, gate.secret)).body.allowed_subs, ['user_1', 'user_2']);
  db.exec("DELETE FROM members WHERE user_id = 'user_2'");
  assert.deepEqual((await allowlist(call, id, gate.secret)).body.allowed_subs, ['user_1']);

  const stop = (await call(`/api/orchard/deployments/${id}/stop`, { method: 'POST', cookie: user })).body;
  await call(`/api/orchard/admin/requests/${stop.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done' } });
  assert.deepEqual((await allowlist(call, id, gate.secret)).body.allowed_subs, []);
});

test('rotating the gate secret is admin-only and revokes the old one; scale-done does not re-mint', async () => {
  const { call, id, gate, user, admin } = await liveDeployment();
  const scale = (await call(`/api/orchard/deployments/${id}/scale`, { method: 'POST', cookie: user, body: { delta: 1 } })).body;
  const scaled = await call(`/api/orchard/admin/requests/${scale.request_id}`, { method: 'POST', cookie: admin, body: { status: 'done' } });
  assert.equal(scaled.body.gate, undefined);
  assert.equal((await allowlist(call, id, gate.secret)).status, 200);

  assert.equal((await call(`/api/orchard/admin/deployments/${id}/gate-secret`, { method: 'POST', cookie: user, body: {} })).status, 403);
  const rotated = await call(`/api/orchard/admin/deployments/${id}/gate-secret`, { method: 'POST', cookie: admin, body: {} });
  assert.equal(rotated.status, 200);
  assert.notEqual(rotated.body.gate.secret, gate.secret);
  assert.match(rotated.body.gate.setup, /fly secrets set GATE_DEPLOYMENT_SECRET=qfg_/);
  assert.equal((await allowlist(call, id, gate.secret)).status, 401);
  assert.equal((await allowlist(call, id, rotated.body.gate.secret)).status, 200);
  const tracker = (await call('/api/orchard/admin/requests', { cookie: admin })).body.requests;
  assert.ok(tracker.every(r => !('gate_secret_hash' in r)), 'the tracker never sees the hash');
  assert.ok(tracker.some(r => r.gate_configured === 1));
});

test('setup falls back to placeholders when the app or WorkOS values are unknown', async () => {
  assert.equal(flyApp('https://gate.example.com'), '<fly-app>');
  const { gate } = await liveDeployment({ WORKOS_AUTHKIT_DOMAIN: undefined, WORKOS_VGI_CLIENT_ID: undefined });
  assert.match(gate.setup, /GATE_AUTH_SERVER = "<WORKOS_AUTHKIT_DOMAIN>"/);
  assert.match(gate.setup, /GATE_CLIENT_ID = "<WORKOS_VGI_CLIENT_ID>"/);
});
