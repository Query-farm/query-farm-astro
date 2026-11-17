// Stripe for hosted Orchard, with plain fetch rather than the Stripe SDK:
//   - Checkout (subscription mode) creates the org's subscription: one metered
//     price per size (billed from Billing Meter events, see meter.ts).
//   - The Customer Portal handles cards and invoices.
//   - The webhook records subscription and payment status on `orgs`.
//   - License quantity for paid workers follows the number of live paid
//     deployments, as a licensed subscription item.

import { BILLING_OK, getOrg, type OrchardDatabase, type OrchardStatement, type OrgRow } from './db';
import { json, log, nowIso, type Fetch, type OrchardEnv } from './http';
import { SIZES } from './pricing';
import type { Session } from './session';

export const STRIPE_API = 'https://api.stripe.com';
/** Stripe-Version for the v2 meter-events endpoint. v1 calls use the account default. */
export const STRIPE_V2_VERSION = '2026-10-28.endive';

type Params = Record<string, string | number | undefined>;

const form = (params: Params) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.append(k, String(v));
  return body;
};

export async function stripe(env: OrchardEnv, fetchImpl: Fetch, method: 'GET' | 'POST', path: string, params: Params = {}, idempotencyKey?: string) {
  const response = await fetchImpl(`${STRIPE_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    ...(method === 'POST' ? { body: form(params) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* non-JSON */ }
  return { ok: response.ok, status: response.status, body };
}

export const billingConfigured = (env: OrchardEnv) =>
  Boolean(env.STRIPE_SECRET_KEY && SIZES.every(s => env[s.priceEnv]));

export const billingActive = (org: Pick<OrgRow, 'billing_status'> | null) => Boolean(org && BILLING_OK.includes(org.billing_status));

/** The org's Stripe customer, created on first use. */
export async function ensureCustomer(env: OrchardEnv, fetchImpl: Fetch, org: OrgRow, session: Session): Promise<string> {
  if (org.stripe_customer_id) return org.stripe_customer_id;
  const created = await stripe(env, fetchImpl, 'POST', '/v1/customers', {
    name: org.name, email: session.email, 'metadata[org_id]': org.id, 'metadata[created_by]': session.uid,
  }, `orchard-customer-${org.id}`);
  if (!created.ok || typeof created.body.id !== 'string') throw new Error(`Stripe customer create answered ${created.status}`);
  const id = created.body.id;
  await env.ORCHARD_DB!.prepare('UPDATE orgs SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL').bind(id, org.id).run();
  return id;
}

/** POST /api/orchard/billing/checkout {return_to?} → {url} */
export async function createCheckout(env: OrchardEnv, fetchImpl: Fetch, session: Session, origin: string, returnTo: string): Promise<Response> {
  if (!billingConfigured(env)) return json({ ok: false, error: 'Billing is not configured yet. Please email hello@query.farm.' }, 503);
  const org = await getOrg(env.ORCHARD_DB!, session.org);
  if (!org) return json({ ok: false, error: 'Workspace not found.' }, 404);
  if (billingActive(org)) return json({ ok: false, error: 'Billing is already set up.', reason: 'already_active' }, 409);
  const customer = await ensureCustomer(env, fetchImpl, org, session);
  const params: Params = {
    mode: 'subscription',
    customer,
    client_reference_id: org.id,
    'subscription_data[metadata][org_id]': org.id,
    success_url: `${origin}${returnTo}${returnTo.includes('?') ? '&' : '?'}billing=done`,
    cancel_url: `${origin}${returnTo}${returnTo.includes('?') ? '&' : '?'}billing=cancelled`,
  };
  // Metered prices take no quantity.
  SIZES.forEach((s, i) => { params[`line_items[${i}][price]`] = env[s.priceEnv]; });
  const created = await stripe(env, fetchImpl, 'POST', '/v1/checkout/sessions', params);
  if (!created.ok || typeof created.body.url !== 'string') {
    log('error', 'orchard_checkout_failed', { org_id: org.id, provider_status: created.status });
    return json({ ok: false, error: 'Stripe Checkout could not be started. Please try again.' }, 502);
  }
  log('info', 'orchard_checkout_started', { org_id: org.id });
  return json({ ok: true, url: created.body.url });
}

/** POST /api/orchard/billing/portal → {url} */
export async function createPortal(env: OrchardEnv, fetchImpl: Fetch, session: Session, origin: string): Promise<Response> {
  if (!env.STRIPE_SECRET_KEY) return json({ ok: false, error: 'Billing is not configured yet.' }, 503);
  const org = await getOrg(env.ORCHARD_DB!, session.org);
  if (!org?.stripe_customer_id) return json({ ok: false, error: 'Set up billing first.', reason: 'no_customer' }, 409);
  const created = await stripe(env, fetchImpl, 'POST', '/v1/billing_portal/sessions', {
    customer: org.stripe_customer_id, return_url: `${origin}/products/orchard/console/`,
  });
  if (!created.ok || typeof created.body.url !== 'string') return json({ ok: false, error: 'The billing portal could not be opened.' }, 502);
  return json({ ok: true, url: created.body.url });
}

/**
 * Keep the license subscription item's quantity equal to the org's live
 * deployments of paid workers. Returns a warning string on failure; billing
 * problems never block Rusty's request tracker.
 */
export async function syncLicenses(env: OrchardEnv, fetchImpl: Fetch, orgId: string): Promise<string | null> {
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_LICENSE) return null;
  const db = env.ORCHARD_DB!;
  const org = await getOrg(db, orgId);
  if (!org?.stripe_subscription_id) return null;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM deployments WHERE org_id = ? AND paid = 1 AND status = 'live'").bind(orgId).first<{ n: number }>();
  const quantity = Number(row?.n ?? 0);
  if (org.license_item_id) {
    const updated = await stripe(env, fetchImpl, 'POST', `/v1/subscription_items/${encodeURIComponent(org.license_item_id)}`, { quantity, proration_behavior: 'create_prorations' });
    if (!updated.ok) return `License quantity update failed (Stripe ${updated.status}).`;
  } else if (quantity > 0) {
    const created = await stripe(env, fetchImpl, 'POST', '/v1/subscription_items', {
      subscription: org.stripe_subscription_id, price: env.STRIPE_PRICE_LICENSE, quantity, proration_behavior: 'create_prorations',
    }, `orchard-license-${org.stripe_subscription_id}`);
    if (!created.ok || typeof created.body.id !== 'string') return `License item create failed (Stripe ${created.status}).`;
    await db.prepare('UPDATE orgs SET license_item_id = ? WHERE id = ?').bind(created.body.id, orgId).run();
  }
  log('info', 'orchard_license_sync', { org_id: orgId, quantity });
  return null;
}

// ── Webhook ────────────────────────────────────────────────────────────────

const hexBytes = (hex: string): Uint8Array<ArrayBuffer> | null =>
  /^(?:[0-9a-f]{2})+$/i.test(hex) ? Uint8Array.from(hex.match(/../g)!, b => parseInt(b, 16)) : null;

/**
 * Stripe signature verification: `Stripe-Signature: t=<unix>,v1=<hex>[,v1=…]`,
 * HMAC-SHA256 over `<t>.<raw body>` keyed by the endpoint secret's UTF-8 bytes
 * (the whole `whsec_…` string, not base64-decoded — unlike Svix). Verified on
 * the untouched bytes with Web Crypto's constant-time verify; five-minute
 * tolerance against replays; every v1 signature is tried so secret rotation works.
 * https://docs.stripe.com/webhooks#verify-manually
 */
export async function verifyStripeSignature(body: Uint8Array, header: string | null, secret: string, now = Date.now()): Promise<boolean> {
  if (!header || !secret.startsWith('whsec_')) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const at = part.indexOf('=');
    const k = part.slice(0, at).trim(), v = part.slice(at + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') signatures.push(v);
  }
  if (!/^\d{1,12}$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300 || !signatures.length) return false;
  try {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const prefix = new TextEncoder().encode(`${timestamp}.`);
    const signed = new Uint8Array(prefix.length + body.length);
    signed.set(prefix); signed.set(body, prefix.length);
    for (const signature of signatures) {
      const bytes = hexBytes(signature);
      if (bytes && bytes.length === 32 && await crypto.subtle.verify('HMAC', key, bytes, signed)) return true;
    }
  } catch { /* malformed secret or signature */ }
  return false;
}

const obj = (v: unknown): Record<string, unknown> | null => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/**
 * D1 updates for one Stripe event. Subscription events guard on
 * `billing_event_at`, so an older one never overwrites a newer status;
 * checkout completion only fills in ids and moves `none` to `active`.
 */
function eventStatements(db: OrchardDatabase, env: OrchardEnv, type: string, created: number, object: Record<string, unknown>): OrchardStatement[] {
  switch (type) {
    case 'checkout.session.completed': {
      const orgId = str(object.client_reference_id), customer = str(object.customer), subscription = str(object.subscription);
      if (!orgId || !customer || !subscription) return [];
      return [db.prepare(`UPDATE orgs SET stripe_customer_id = ?, stripe_subscription_id = ?,
          billing_status = CASE WHEN billing_status = 'none' THEN 'active' ELSE billing_status END
        WHERE id = ? AND (stripe_customer_id IS NULL OR stripe_customer_id = ?)`)
        .bind(customer, subscription, orgId, customer)];
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const id = str(object.id), customer = str(object.customer);
      const status = type === 'customer.subscription.deleted' ? 'canceled' : str(object.status);
      if (!id || !customer || !status) return [];
      const items = (obj(object.items)?.data as unknown[] | undefined) ?? [];
      const license = items.map(obj).find(i => env.STRIPE_PRICE_LICENSE && str(obj(i?.price)?.id) === env.STRIPE_PRICE_LICENSE);
      return [db.prepare(`UPDATE orgs SET stripe_subscription_id = ?, billing_status = ?,
          license_item_id = COALESCE(?, license_item_id), billing_event_at = ?
        WHERE stripe_customer_id = ? AND (stripe_subscription_id IS NULL OR stripe_subscription_id = ?)
          AND COALESCE(billing_event_at, 0) <= ?`)
        .bind(id, status, str(license?.id), created, customer, id, created)];
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const customer = str(object.customer);
      if (!customer) return [];
      return [db.prepare('UPDATE orgs SET payment_status = ? WHERE stripe_customer_id = ?')
        .bind(type === 'invoice.paid' ? 'paid' : 'failed', customer)];
    }
    default:
      return [];
  }
}

export const HANDLED_EVENTS = [
  'checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated',
  'customer.subscription.deleted', 'invoice.paid', 'invoice.payment_failed',
];

/** POST /api/stripe/webhook */
export async function handleStripeWebhook(request: Request, env: OrchardEnv, now = Date.now()): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.ORCHARD_DB) return json({ ok: false, error: 'Billing webhooks are not configured.' }, 503);
  const limit = 256 * 1024;
  if (Number(request.headers.get('content-length') ?? 0) > limit) return json({ ok: false }, 413);
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length > limit) return json({ ok: false }, 413);
  if (!await verifyStripeSignature(bytes, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET, now)) {
    return json({ ok: false, error: 'Invalid signature.' }, 400);
  }
  let event: Record<string, unknown> | null;
  try { event = obj(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { return json({ ok: false }, 400); }
  const id = str(event?.id), type = str(event?.type), created = Number(event?.created);
  const object = obj(obj(event?.data)?.object);
  if (!id || !type || !Number.isFinite(created) || !object) return json({ ok: false }, 400);
  if (!HANDLED_EVENTS.includes(type)) return json({ ok: true, ignored: true });

  const db = env.ORCHARD_DB;
  try {
    const seen = await db.prepare('SELECT id FROM stripe_events WHERE id = ?').bind(id).first<{ id: string }>();
    if (seen) return json({ ok: true, duplicate: true });
    // One transaction: the dedupe row lands only with its updates.
    await db.batch([
      db.prepare('INSERT INTO stripe_events (id, type, received_at) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id, type, nowIso()),
      ...eventStatements(db, env, type, created, object),
    ]);
    log('info', 'orchard_stripe_event', { event_id: id, type });
    return json({ ok: true });
  } catch {
    // Non-2xx makes Stripe retry.
    log('error', 'orchard_stripe_event_failed', { event_id: id, type });
    return json({ ok: false, error: 'Event could not be saved.' }, 503);
  }
}
