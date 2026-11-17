import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { seal, SESSION_COOKIE } from '../src/lib/orchard/session.ts';
import { resetWorkerCache } from '../src/lib/orchard/workers.ts';

// The real migrations, in order, on node:sqlite behind the D1 shape the code uses.
const MIGRATIONS = new URL('../migrations/orchard/', import.meta.url);
export function orchardDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
  const statement = (sql, values = []) => ({
    bind: (...next) => statement(sql, next),
    run: async () => { const result = sqlite.prepare(sql).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; },
    first: async () => sqlite.prepare(sql).get(...values) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...values) }),
  });
  return {
    sqlite,
    prepare: statement,
    batch: async statements => {
      sqlite.exec('BEGIN');
      try { const results = []; for (const stmt of statements) results.push(await stmt.run()); sqlite.exec('COMMIT'); return results; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

export const SECRET = 'test-session-secret-0123456789abcdef-xyz';
export const ORIGIN = 'https://query.farm';

export const WORKERS = [
  { slug: 'yfinance', name: 'Yahoo Finance', catalog: 'yfinance', pricing: 'open', version: 'v0.2.0', versions: ['v0.2.0', 'v0.1.9'] },
  { slug: 'premium', name: 'Premium Data', catalog: 'premium', pricing: 'paid', version: 'v1.0.0' },
];

export function assets(workers = WORKERS) {
  resetWorkerCache();
  return { fetch: async () => Response.json({ schemaVersion: 1, workers }) };
}

export function env(overrides = {}) {
  return {
    ORCHARD_DB: orchardDatabase(),
    SESSION_SECRET: SECRET,
    WORKOS_CLIENT_ID: 'client_test',
    WORKOS_API_KEY: 'sk_test_workos',
    RESEND_API_KEY: 're_test',
    ORCHARD_ADMINS: 'rusty@query.farm',
    STRIPE_SECRET_KEY: 'sk_test_stripe',
    STRIPE_WEBHOOK_SECRET: 'whsec_test_secret_value',
    STRIPE_PRICE_S: 'price_s', STRIPE_PRICE_M: 'price_m', STRIPE_PRICE_L: 'price_l', STRIPE_PRICE_LICENSE: 'price_license',
    ORCHARD_METER_TOKEN: 'meter-token-for-tests',
    ASSETS: assets(),
    ...overrides,
  };
}

/**
 * A stub fetch: `routes` maps "METHOD url-prefix" to a handler returning a
 * Response (or a plain object, sent as 200 JSON). Every call is recorded.
 */
export function stubFetch(routes = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    let body = init.body;
    if (body instanceof URLSearchParams) body = Object.fromEntries(body);
    else if (typeof body === 'string') { try { body = JSON.parse(body); } catch { /* raw */ } }
    const call = { url, method, body, headers: init.headers ?? {} };
    calls.push(call);
    const key = Object.keys(routes).filter(k => { const [m, p] = k.split(' '); return m === method && url.startsWith(p); })
      .sort((a, b) => b.length - a.length)[0];
    if (!key) return Response.json({ error: { message: `unstubbed ${method} ${url}` } }, { status: 599 });
    const out = await routes[key](call);
    return out instanceof Response ? out : Response.json(out);
  };
  return { calls, fetchImpl, find: (method, prefix) => calls.filter(c => c.method === method && c.url.startsWith(prefix)) };
}

export const RESEND = { 'POST https://api.resend.com/emails': () => ({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }) };

/** A session cookie header for a signed-in user. */
export async function sessionHeader({ uid = 'user_1', email = 'ada@example.com', ev = true, name = 'Ada', org = 'org_1', exp } = {}) {
  const value = await seal({ uid, email, ev, name, org, rt: 'rt_1', sid: 'session_1', exp: exp ?? Math.floor(Date.now() / 1000) + 3600 }, SECRET, SESSION_COOKIE);
  return `${SESSION_COOKIE}=${value}`;
}

export async function seedOrg(db, { id = 'org_1', name = 'example.com', userId = 'user_1', email = 'ada@example.com', billing = 'active', customer = 'cus_1', subscription = 'sub_1' } = {}) {
  db.sqlite.prepare(`INSERT INTO orgs (id, name, created_at, created_by, stripe_customer_id, stripe_subscription_id, billing_status)
    VALUES (?, ?, '2026-11-01T00:00:00.000Z', ?, ?, ?, ?)`).run(id, name, userId, customer, subscription, billing);
  db.sqlite.prepare(`INSERT INTO members (org_id, user_id, email, name, role, created_at) VALUES (?, ?, ?, 'Ada', 'admin', '2026-11-01T00:00:00.000Z')`)
    .run(id, userId, email);
}

export function req(path, { method = 'GET', body, cookie, headers = {} } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Origin: ORIGIN, ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
