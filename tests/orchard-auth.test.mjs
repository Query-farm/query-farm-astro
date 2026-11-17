import assert from 'node:assert/strict';
import test from 'node:test';

import { handleCallback, handleLogin, handleLogout, defaultOrgName } from '../src/lib/orchard/auth.ts';
import { OAUTH_COOKIE, SESSION_COOKIE, isAdmin, requireSession, seal, unseal } from '../src/lib/orchard/session.ts';
import { safePath } from '../src/lib/orchard/http.ts';
import { ORIGIN, RESEND, SECRET, env, sessionHeader, stubFetch } from './orchard-support.mjs';

// Structured logs are part of the contract but noisy in test output.
for (const level of ['info', 'warn', 'error']) console[level] = () => {};

const setCookies = response => response.headers.getSetCookie();
const cookieValue = (response, name) => {
  const line = setCookies(response).find(c => c.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).split(';')[0] : null;
};

test('seal/unseal round-trips, and rejects tampering, the wrong key and the wrong purpose', async () => {
  const sealed = await seal({ hello: 'world' }, SECRET, 'a');
  assert.deepEqual(await unseal(sealed, SECRET, 'a'), { hello: 'world' });
  assert.notEqual(await seal({ hello: 'world' }, SECRET, 'a'), sealed, 'fresh IV every time');
  const bytes = sealed.slice(3).split('');
  bytes[20] = bytes[20] === 'A' ? 'B' : 'A';
  assert.equal(await unseal(`v1.${bytes.join('')}`, SECRET, 'a'), null);
  assert.equal(await unseal(sealed, `${SECRET}-other`, 'a'), null);
  assert.equal(await unseal(sealed, SECRET, 'b'), null, 'purpose is bound as AAD');
  assert.equal(await unseal('v1.!!!', SECRET, 'a'), null);
  assert.equal(await unseal(null, SECRET, 'a'), null);
});

test('requireSession accepts a valid cookie and refuses expired, tampered or OAuth-state cookies', async () => {
  const e = env();
  const ok = new Request(ORIGIN, { headers: { Cookie: `other=1; ${await sessionHeader()}` } });
  assert.equal((await requireSession(ok, e)).uid, 'user_1');
  const expired = new Request(ORIGIN, { headers: { Cookie: await sessionHeader({ exp: Math.floor(Date.now() / 1000) - 1 }) } });
  assert.equal(await requireSession(expired, e), null);
  const swapped = await seal({ uid: 'user_1', org: 'org_1', exp: 9e9 }, SECRET, OAUTH_COOKIE);
  assert.equal(await requireSession(new Request(ORIGIN, { headers: { Cookie: `${SESSION_COOKIE}=${swapped}` } }), e), null);
  assert.equal(await requireSession(ok, { ...e, SESSION_SECRET: 'short' }), null, 'a weak secret disables sessions');
});

test('admins must be on the allow-list with a verified email', () => {
  const e = { ORCHARD_ADMINS: ' Rusty@Query.farm , ops@query.farm' };
  assert.equal(isAdmin({ email: 'rusty@query.farm', ev: true }, e), true);
  assert.equal(isAdmin({ email: 'rusty@query.farm', ev: false }, e), false);
  assert.equal(isAdmin({ email: 'eve@query.farm', ev: true }, e), false);
  assert.equal(isAdmin({ email: 'rusty@query.farm', ev: true }, {}), false);
});

test('safePath only allows same-site relative paths', () => {
  assert.equal(safePath('/products/orchard/console/new?worker=x', '/'), '/products/orchard/console/new?worker=x');
  for (const bad of ['//evil.com', '/\\evil.com', 'https://evil.com', '', null]) assert.equal(safePath(bad, '/fallback'), '/fallback');
});

test('login is 503 without configuration, and redirects to AuthKit with a sealed state cookie', async () => {
  assert.equal((await handleLogin(new Request(`${ORIGIN}/api/auth/login`), {})).status, 503);
  const e = env();
  const response = await handleLogin(new Request(`${ORIGIN}/api/auth/login?return_to=//evil.com&worker=yfinance&source=/products/orchard/connectors/yfinance&signup=1`), e);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.origin + location.pathname, 'https://api.workos.com/user_management/authorize');
  assert.equal(location.searchParams.get('client_id'), 'client_test');
  assert.equal(location.searchParams.get('provider'), 'authkit');
  assert.equal(location.searchParams.get('redirect_uri'), `${ORIGIN}/api/auth/callback`);
  assert.equal(location.searchParams.get('screen_hint'), 'sign-up');
  const state = await unseal(cookieValue(response, OAUTH_COOKIE), SECRET, OAUTH_COOKIE);
  assert.equal(state.state, location.searchParams.get('state'));
  assert.equal(state.returnTo, '/products/orchard/console/', 'open redirect refused');
  assert.equal(state.worker, 'yfinance');
  assert.match(setCookies(response)[0], /HttpOnly; SameSite=Lax; Secure/);
});

async function startLogin(e, query = '?worker=yfinance&source=/products/orchard/connectors/yfinance&return_to=/products/orchard/console/new?worker=yfinance') {
  const login = await handleLogin(new Request(`${ORIGIN}/api/auth/login${query}`), e);
  const state = new URL(login.headers.get('Location')).searchParams.get('state');
  return { state, cookie: `${OAUTH_COOKIE}=${cookieValue(login, OAUTH_COOKIE)}` };
}

const jwt = claims => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const USER = { id: 'user_new', email: 'ada@lovelace.dev', email_verified: true, first_name: 'Ada', last_name: 'Lovelace' };

test('first sign-in creates a WorkOS organisation, re-scopes the tokens, records a lead and emails once', async () => {
  const e = env();
  const { state, cookie } = await startLogin(e);
  const workos = stubFetch({
    'POST https://api.workos.com/user_management/authenticate': ({ body }) => body.grant_type === 'authorization_code'
      ? { user: USER, access_token: jwt({ sid: 'sess_a' }), refresh_token: 'rt_unscoped' }
      : { user: USER, organization_id: body.organization_id, access_token: jwt({ sid: 'sess_b', org_id: body.organization_id }), refresh_token: 'rt_scoped' },
    'POST https://api.workos.com/organizations': ({ body }) => ({ id: 'org_new', name: body.name }),
    'POST https://api.workos.com/user_management/organization_memberships': () => ({ id: 'om_1' }),
    ...RESEND,
  });
  const response = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } }), e, workos.fetchImpl);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('Location'), `${ORIGIN}/products/orchard/console/new?worker=yfinance`);

  const [exchange, scope] = workos.find('POST', 'https://api.workos.com/user_management/authenticate');
  assert.deepEqual(exchange.body, { client_id: 'client_test', client_secret: 'sk_test_workos', grant_type: 'authorization_code', code: 'abc' });
  assert.deepEqual(scope.body, { client_id: 'client_test', client_secret: 'sk_test_workos', grant_type: 'refresh_token', refresh_token: 'rt_unscoped', organization_id: 'org_new' });
  assert.equal(workos.find('POST', 'https://api.workos.com/organizations')[0].body.name, 'lovelace.dev');
  assert.deepEqual(workos.find('POST', 'https://api.workos.com/user_management/organization_memberships')[0].body, { user_id: 'user_new', organization_id: 'org_new', role_slug: 'admin' });

  const session = await unseal(cookieValue(response, SESSION_COOKIE), SECRET, SESSION_COOKIE);
  assert.equal(session.org, 'org_new');
  assert.equal(session.rt, 'rt_scoped');
  assert.equal(session.sid, 'sess_b');
  assert.equal(session.ev, true);
  assert.equal(cookieValue(response, OAUTH_COOKIE), '', 'state cookie cleared');

  const db = e.ORCHARD_DB.sqlite;
  assert.equal(db.prepare('SELECT name FROM orgs WHERE id = ?').get('org_new').name, 'lovelace.dev');
  assert.equal(db.prepare('SELECT role FROM members WHERE user_id = ?').get('user_new').role, 'admin');
  const lead = db.prepare('SELECT * FROM leads').get();
  assert.equal(lead.worker, 'yfinance');
  assert.equal(lead.source_page, '/products/orchard/connectors/yfinance');
  assert.equal(lead.resend_id, '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794');
  const email = workos.find('POST', 'https://api.resend.com/emails')[0].body;
  assert.match(email.subject, /Orchard sign-up: Ada Lovelace \(yfinance\)/);
  assert.equal(email.reply_to, 'ada@lovelace.dev');

  // Second sign-in: WorkOS now reports the org; no new org, no second lead email.
  const again = await startLogin(e);
  const returning = stubFetch({
    'POST https://api.workos.com/user_management/authenticate': () => ({ user: USER, organization_id: 'org_new', access_token: jwt({ sid: 's' }), refresh_token: 'rt' }),
    ...RESEND,
  });
  const second = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=def&state=${again.state}`, { headers: { Cookie: again.cookie } }), e, returning.fetchImpl);
  assert.equal(second.status, 302);
  assert.equal(returning.find('POST', 'https://api.workos.com/organizations').length, 0);
  assert.equal(returning.find('POST', 'https://api.resend.com/emails').length, 0);
  assert.equal(returning.find('POST', 'https://api.workos.com/user_management/authenticate').length, 1, 'already scoped: no refresh');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM leads').get().n, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orgs').get().n, 1);
});

test('a member of several organisations continues with the one we already know', async () => {
  const e = env();
  e.ORCHARD_DB.sqlite.exec(`INSERT INTO orgs (id, name, created_at, created_by) VALUES ('org_b', 'B Corp', 'x', 'user_new');
    INSERT INTO members (org_id, user_id, email, created_at) VALUES ('org_b', 'user_new', 'ada@lovelace.dev', 'x');`);
  const { state, cookie } = await startLogin(e);
  const workos = stubFetch({
    'POST https://api.workos.com/user_management/authenticate': ({ body }) => body.grant_type === 'authorization_code'
      ? Response.json({ code: 'organization_selection_required', pending_authentication_token: 'pat_1', user: USER,
        organizations: [{ id: 'org_a', name: 'A' }, { id: 'org_b', name: 'B Corp' }] }, { status: 403 })
      : { user: USER, organization_id: body.organization_id, access_token: jwt({ sid: 's' }), refresh_token: 'rt_b' },
    ...RESEND,
  });
  const response = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: cookie } }), e, workos.fetchImpl);
  assert.equal(response.status, 302);
  const selection = workos.find('POST', 'https://api.workos.com/user_management/authenticate')[1].body;
  assert.equal(selection.grant_type, 'urn:workos:oauth:grant-type:organization-selection');
  assert.equal(selection.pending_authentication_token, 'pat_1');
  assert.equal(selection.organization_id, 'org_b');
  assert.equal((await unseal(cookieValue(response, SESSION_COOKIE), SECRET, SESSION_COOKIE)).org, 'org_b');
});

test('callback refuses a missing or mismatched state, and reports WorkOS failures without a session', async () => {
  const e = env();
  const none = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=abc&state=x`), e, stubFetch().fetchImpl);
  assert.equal(none.status, 400);
  const { cookie } = await startLogin(e);
  const wrong = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=abc&state=nope`, { headers: { Cookie: cookie } }), e, stubFetch().fetchImpl);
  assert.equal(wrong.status, 400);
  assert.equal(cookieValue(wrong, SESSION_COOKIE), null);

  const { state, cookie: c2 } = await startLogin(e);
  const failing = stubFetch({ 'POST https://api.workos.com/user_management/authenticate': () => Response.json({ error: 'invalid_grant' }, { status: 400 }) });
  const failed = await handleCallback(new Request(`${ORIGIN}/api/auth/callback?code=abc&state=${state}`, { headers: { Cookie: c2 } }), e, failing.fetchImpl);
  assert.equal(failed.status, 502);
  assert.equal(cookieValue(failed, SESSION_COOKIE), null);
});

test('org names use work domains, and the person for free-mail addresses', () => {
  assert.equal(defaultOrgName({ email: 'a@acme.io', first_name: 'A' }), 'acme.io');
  assert.equal(defaultOrgName({ email: 'ada@gmail.com', first_name: 'Ada' }), "Ada's organization");
  assert.equal(defaultOrgName({ email: 'ada@gmail.com' }), "ada's organization");
});

test('logout clears the cookie and ends the WorkOS session', async () => {
  const e = env();
  const response = await handleLogout(new Request(`${ORIGIN}/api/auth/logout`, { headers: { Cookie: await sessionHeader() } }), e);
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get('Location'));
  assert.equal(location.pathname, '/user_management/sessions/logout');
  assert.equal(location.searchParams.get('session_id'), 'session_1');
  assert.equal(location.searchParams.get('return_to'), `${ORIGIN}/products/orchard/`);
  assert.match(setCookies(response)[0], /^qf_session=; Path=\/; Max-Age=0/);
  const anonymous = await handleLogout(new Request(`${ORIGIN}/api/auth/logout`), e);
  assert.equal(anonymous.headers.get('Location'), `${ORIGIN}/products/orchard/`);
});
