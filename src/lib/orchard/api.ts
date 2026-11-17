// The hosted Orchard console API, /api/orchard/*. Everything but /meter needs
// a session (src/lib/orchard/session.ts); /admin/* also needs ORCHARD_ADMINS.
//
//   GET  me                         who am I, my org, billing state
//   GET  deployments                my org's deployments, open requests, month-to-date cost
//   POST deployments                {worker, version?, size, instances, region, allow_duplicate?} → create request
//                                   (409 duplicate when the workspace already runs that worker)
//   POST deployments/:id/scale      {delta: 1 | -1} → scale request
//   POST deployments/:id/stop       → stop request
//   POST billing/checkout           {return_to} → Stripe Checkout URL
//   POST billing/portal             → Stripe Customer Portal URL
//   GET  admin/requests             the request tracker (open + recent)
//   POST admin/requests/:id         {status, endpoint?, instances?, note?}
//   POST admin/deployments/:id/gate-secret   new gate secret + Fly setup (shown once)
//   POST meter                      bearer ORCHARD_METER_TOKEN (see meter.ts)
//   GET  gate/deployments/:id/allowlist      bearer per-deployment secret (see gate.ts)
//
// Fly provisioning stays manual: a request emails the team, Rusty runs
// `fly deploy`, then marks the request done here, which writes the
// `deployment_events` row that metering integrates.

import {
  getDeployment, getOrg, listDeployments, openRequests,
  type DeploymentRow, type DeploymentStatus, type RequestKind, type RequestRow,
} from './db';
import { json, log, nowIso, readJson, safePath, text, type Fetch, type OrchardEnv } from './http';
import { gateSetup, handleGateAllowlist, newGateSecret } from './gate';
import { handleMeter, monthToDate } from './meter';
import { notifyTeam } from './notify';
import { LICENSE_MONTHLY_USD, MAX_INSTANCES, SIZES, isRegion, minutesCostUsd, sizeById } from './pricing';
import { isAdmin, requireSession, type Session } from './session';
import { billingActive, billingConfigured, createCheckout, createPortal, syncLicenses } from './stripe';
import { deployableVersions, hostedWorkers } from './workers';

const ID = /^[a-z]+_[0-9a-f-]{36}$/;
/** Deployments that count as "already have it": anything not stopped or turned down. */
const ACTIVE = new Set<DeploymentStatus>(['requested', 'provisioning', 'live']);

/** The ATTACH a customer pastes. No secrets: the hosted gateway signs them in with OAuth. */
export function attachSnippet(d: Pick<DeploymentRow, 'catalog' | 'endpoint'>): string | null {
  if (!d.endpoint) return null;
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return [`ATTACH ${q(d.catalog)} AS ${d.catalog} (`, '  TYPE vgi,', `  LOCATION ${q(d.endpoint)}`, ');'].join('\n');
}

const publicDeployment = (d: DeploymentRow, requests: RequestRow[]) => ({
  id: d.id,
  worker: d.worker,
  workerName: d.worker_name,
  catalog: d.catalog,
  version: d.version,
  paid: d.paid === 1,
  size: d.size,
  region: d.region,
  desiredInstances: d.desired_instances,
  actualInstances: d.actual_instances,
  status: d.status,
  endpoint: d.endpoint,
  attachSql: attachSnippet(d),
  createdAt: d.created_at,
  pendingRequests: requests.filter(r => r.deployment_id === d.id).map(r => ({
    id: r.id, kind: r.kind, desiredInstances: r.desired_instances, status: r.status, createdAt: r.created_at,
  })),
});

/** Same-origin check for state-changing calls (SameSite=Lax already blocks most cross-site POSTs). */
function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  return !origin || origin === new URL(request.url).origin;
}

async function teamRequestEmail(env: OrchardEnv, fetchImpl: Fetch, session: Session, d: DeploymentRow, kind: RequestKind, desired: number) {
  const size = sizeById(d.size);
  await notifyTeam(env, {
    tag: `request_${kind}`,
    replyTo: session.email,
    subject: `Orchard ${kind} request: ${d.worker_name} × ${desired} (${d.size.toUpperCase()}, ${d.region})`,
    lines: [
      `Request:      ${kind}`,
      `Deployment:   ${d.id}`,
      `Worker:       ${d.worker} ${d.version ?? ''}${d.paid ? ' (paid)' : ''}`,
      `Size:         ${size?.label} — fly --vm-size ${size?.flyPreset}`,
      `Region:       ${d.region}`,
      `Instances:    ${d.actual_instances} → ${desired}`,
      `Requested by: ${session.name || session.email} <${session.email}> (${session.org})`,
      '',
      'Fulfil it, then mark it done in /products/orchard/console/admin/.',
    ],
  }, fetchImpl);
}

/** Record a scale/stop request, folding repeated +/− clicks into one unstarted request. */
async function requestChange(env: OrchardEnv, fetchImpl: Fetch, session: Session, d: DeploymentRow, kind: 'scale' | 'stop', desired: number) {
  const db = env.ORCHARD_DB!;
  const at = nowIso();
  const pending = await db.prepare(`SELECT * FROM requests WHERE deployment_id = ? AND status = 'new' AND kind IN ('create', 'scale')
    ORDER BY created_at DESC LIMIT 1`).bind(d.id).first<RequestRow>();
  let requestId: string;
  let folded = false;
  if (pending && kind === 'scale') {
    requestId = pending.id;
    folded = true;
    await db.batch([
      db.prepare('UPDATE requests SET desired_instances = ?, updated_at = ? WHERE id = ?').bind(desired, at, pending.id),
      db.prepare('UPDATE deployments SET desired_instances = ?, updated_at = ? WHERE id = ?').bind(desired, at, d.id),
    ]);
  } else {
    requestId = `req_${crypto.randomUUID()}`;
    await db.batch([
      db.prepare(`INSERT INTO requests (id, deployment_id, org_id, kind, desired_instances, status, created_at, created_by, updated_at)
        VALUES (?, ?, ?, ?, ?, 'new', ?, ?, ?)`).bind(requestId, d.id, d.org_id, kind, desired, at, session.uid, at),
      db.prepare('UPDATE deployments SET desired_instances = ?, updated_at = ? WHERE id = ?').bind(desired, at, d.id),
    ]);
  }
  log('info', 'orchard_request', { request_id: requestId, deployment_id: d.id, kind, desired, folded });
  if (!folded) await teamRequestEmail(env, fetchImpl, session, d, kind, desired);
  return json({ ok: true, request_id: requestId, desired_instances: desired, folded });
}

async function createDeployment(request: Request, env: OrchardEnv, fetchImpl: Fetch, session: Session): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'Expected a JSON object.' }, 400);
  const errors: Record<string, string> = {};
  const slug = text(body.worker, 100);
  const size = sizeById(text(body.size, 2));
  const region = text(body.region, 10);
  const instances = Number(body.instances);
  if (!size) errors.size = 'Choose a size.';
  if (!isRegion(region)) errors.region = 'Choose a region.';
  if (!Number.isInteger(instances) || instances < 1 || instances > MAX_INSTANCES) errors.instances = `Choose 1 to ${MAX_INSTANCES} instances.`;
  let worker;
  try { worker = (await hostedWorkers(env, request)).get(slug); }
  catch { return json({ ok: false, error: 'The worker list is unavailable. Please try again.' }, 503); }
  if (!worker) errors.worker = 'Choose a worker from the Orchard.';
  const versions = worker ? deployableVersions(worker) : [];
  const version = text(body.version, 100) || versions[0] || null;
  if (worker && version && !versions.includes(version)) errors.version = 'Choose one of the listed releases.';
  if (Object.keys(errors).length) return json({ ok: false, error: 'Check the highlighted fields.', errors }, 400);
  const allowDuplicate = body.allow_duplicate === true;

  const org = await getOrg(db, session.org);
  if (!org) return json({ ok: false, error: 'Workspace not found.' }, 404);
  if (!billingActive(org)) {
    return json({ ok: false, reason: 'billing_required', error: 'Set up billing before requesting a deployment.' }, 402);
  }
  const duplicate = async () => {
    const existing = (await listDeployments(db, org.id)).filter(d => d.worker === worker!.slug && ACTIVE.has(d.status));
    if (!existing.length) return null;
    const requests = await openRequests(db, org.id);
    return json({
      ok: false, reason: 'duplicate',
      error: `Your workspace already has ${worker!.name}. Scale it from the console, or confirm you want a separate deployment.`,
      existing: existing.map(d => publicDeployment(d, requests)),
    }, 409);
  };
  if (!allowDuplicate) { const refusal = await duplicate(); if (refusal) return refusal; }

  const at = nowIso();
  const deploymentId = `dep_${crypto.randomUUID()}`;
  const requestId = `req_${crypto.randomUUID()}`;
  // Without allow_duplicate the insert re-checks inside the transaction, so two
  // quick submits can't both create a deployment of the same worker.
  const guard = allowDuplicate ? '' : `WHERE NOT EXISTS (SELECT 1 FROM deployments WHERE org_id = ? AND worker = ?
      AND status IN ('requested', 'provisioning', 'live'))`;
  const insert = db.prepare(`INSERT INTO deployments (id, org_id, worker, worker_name, catalog, version, paid, size, region,
        desired_instances, actual_instances, status, created_at, created_by, updated_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'requested', ?, ?, ? ${guard}`)
    .bind(deploymentId, org.id, worker!.slug, worker!.name, worker!.catalog, version, worker!.pricing === 'paid' ? 1 : 0,
      size!.id, region, instances, at, session.uid, at, ...(allowDuplicate ? [] : [org.id, worker!.slug]));
  const results = await db.batch([
    insert,
    db.prepare(`INSERT INTO requests (id, deployment_id, org_id, kind, desired_instances, status, created_at, created_by, updated_at)
      SELECT ?, ?, ?, 'create', ?, 'new', ?, ?, ? WHERE EXISTS (SELECT 1 FROM deployments WHERE id = ?)`)
      .bind(requestId, deploymentId, org.id, instances, at, session.uid, at, deploymentId),
  ]);
  if (!results[0]?.meta?.changes) return (await duplicate()) ?? json({ ok: false, error: 'That did not work. Please try again.' }, 409);
  const deployment = (await getDeployment(db, org.id, deploymentId))!;
  log('info', 'orchard_request', { request_id: requestId, deployment_id: deploymentId, kind: 'create', desired: instances });
  await teamRequestEmail(env, fetchImpl, session, deployment, 'create', instances);
  return json({ ok: true, deployment: publicDeployment(deployment, []), request_id: requestId }, 201);
}

async function listForOrg(env: OrchardEnv, session: Session): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const [deployments, requests, minutes] = await Promise.all([
    listDeployments(db, session.org), openRequests(db, session.org), monthToDate(env, session.org),
  ]);
  const usageUsd = SIZES.reduce((sum, s) => sum + minutesCostUsd(s, minutes[s.id]), 0);
  const paidLive = deployments.filter(d => d.paid === 1 && d.status === 'live').length;
  return json({
    ok: true,
    deployments: deployments.map(d => publicDeployment(d, requests)),
    monthToDate: {
      instanceHours: Object.fromEntries(SIZES.map(s => [s.id, Math.round(minutes[s.id] / 6) / 10])),
      usageUsd: Math.round(usageUsd * 100) / 100,
      licenseMonthlyUsd: paidLive * LICENSE_MONTHLY_USD,
    },
  });
}

// ── Admin: the request tracker ───────────────────────────────────────────

async function adminList(env: OrchardEnv): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const rows = (await db.prepare(`SELECT r.*, d.worker, d.worker_name, d.version, d.paid, d.size, d.region, d.status AS deployment_status,
      d.actual_instances, d.endpoint, d.gate_secret_hash IS NOT NULL AS gate_configured, o.name AS org_name, o.billing_status, m.email AS requester_email
    FROM requests r JOIN deployments d ON d.id = r.deployment_id JOIN orgs o ON o.id = r.org_id
    LEFT JOIN members m ON m.org_id = r.org_id AND m.user_id = r.created_by
    WHERE r.status IN ('new', 'in_progress') OR r.updated_at >= ?
    ORDER BY CASE r.status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, r.created_at`)
    .bind(new Date(Date.now() - 14 * 86_400_000).toISOString()).all<Record<string, unknown>>()).results;
  return json({ ok: true, requests: rows });
}

/** POST admin/deployments/:id/gate-secret — replace the gate secret; the old one stops working at once. */
async function adminRotateGateSecret(request: Request, env: OrchardEnv, session: Session, deploymentId: string): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const d = await db.prepare('SELECT * FROM deployments WHERE id = ?').bind(deploymentId).first<DeploymentRow>();
  if (!d) return json({ ok: false, error: 'Deployment not found.' }, 404);
  const { secret, hash } = await newGateSecret();
  await db.prepare('UPDATE deployments SET gate_secret_hash = ?, updated_at = ? WHERE id = ?').bind(hash, nowIso(), d.id).run();
  log('info', 'orchard_gate_secret_rotated', { deployment_id: d.id, actor: session.email });
  return json({ ok: true, gate: { secret, setup: gateSetup(env, new URL(request.url).origin, d, secret) } });
}

async function adminUpdate(request: Request, env: OrchardEnv, fetchImpl: Fetch, session: Session, requestId: string): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const body = await readJson(request);
  if (!body) return json({ ok: false, error: 'Expected a JSON object.' }, 400);
  const r = await db.prepare('SELECT * FROM requests WHERE id = ?').bind(requestId).first<RequestRow>();
  if (!r) return json({ ok: false, error: 'Request not found.' }, 404);
  if (r.status === 'done' || r.status === 'rejected') return json({ ok: false, error: `Request is already ${r.status}.` }, 409);
  const d = (await getDeployment(db, r.org_id, r.deployment_id))!;
  const status = text(body.status, 20);
  const note = text(body.note, 1000) || null;
  const at = nowIso();
  const actor = session.email;

  if (status === 'in_progress') {
    await db.batch([
      db.prepare("UPDATE requests SET status = 'in_progress', note = COALESCE(?, note), updated_at = ? WHERE id = ?").bind(note, at, r.id),
      ...(r.kind === 'create' ? [db.prepare("UPDATE deployments SET status = 'provisioning', updated_at = ? WHERE id = ?").bind(at, d.id)] : []),
    ]);
    return json({ ok: true });
  }

  if (status === 'rejected') {
    const deploymentUpdate = r.kind === 'create'
      ? db.prepare("UPDATE deployments SET status = 'rejected', desired_instances = 0, updated_at = ? WHERE id = ?").bind(at, d.id)
      : db.prepare('UPDATE deployments SET desired_instances = actual_instances, updated_at = ? WHERE id = ?').bind(at, d.id);
    await db.batch([
      db.prepare("UPDATE requests SET status = 'rejected', note = COALESCE(?, note), resolved_by = ?, updated_at = ? WHERE id = ?").bind(note, actor, at, r.id),
      deploymentUpdate,
    ]);
    log('info', 'orchard_request_resolved', { request_id: r.id, status, actor });
    return json({ ok: true });
  }

  if (status !== 'done') return json({ ok: false, error: 'status must be in_progress, done or rejected.' }, 400);

  // Done: record what is actually running now.
  const instances = r.kind === 'stop' ? 0 : body.instances === undefined ? r.desired_instances : Number(body.instances);
  if (!Number.isInteger(instances) || instances < 0 || instances > MAX_INSTANCES) {
    return json({ ok: false, error: `instances must be 0 to ${MAX_INSTANCES}.`, errors: { instances: 'Out of range.' } }, 400);
  }
  let endpoint = d.endpoint;
  if (body.endpoint !== undefined && text(body.endpoint)) endpoint = text(body.endpoint);
  if (r.kind === 'create' && !endpoint) return json({ ok: false, error: 'Set the endpoint URL.', errors: { endpoint: 'Required.' } }, 400);
  if (endpoint) {
    try {
      const u = new URL(endpoint);
      if (u.protocol !== 'https:') throw new Error('https only');
    } catch { return json({ ok: false, error: 'The endpoint must be an https:// URL.', errors: { endpoint: 'Invalid URL.' } }, 400); }
  }
  const nextStatus: DeploymentStatus = instances === 0 ? 'stopped' : 'live';
  // First time live: mint the gate's allow-list secret. It is returned once, here.
  const gate = nextStatus === 'live' && !d.gate_secret_hash ? await newGateSecret() : null;
  await db.batch([
    db.prepare("UPDATE requests SET status = 'done', note = COALESCE(?, note), resolved_by = ?, updated_at = ? WHERE id = ?").bind(note, actor, at, r.id),
    db.prepare('UPDATE deployments SET actual_instances = ?, status = ?, endpoint = ?, updated_at = ? WHERE id = ?')
      .bind(instances, nextStatus, endpoint, at, d.id),
    db.prepare('INSERT INTO deployment_events (deployment_id, org_id, size, instances, occurred_at, request_id, actor) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(d.id, d.org_id, d.size, instances, at, r.id, actor),
    ...(gate ? [db.prepare('UPDATE deployments SET gate_secret_hash = ? WHERE id = ?').bind(gate.hash, d.id)] : []),
  ]);
  log('info', 'orchard_request_resolved', { request_id: r.id, status, actor, instances });
  const warning = d.paid === 1 ? await syncLicenses(env, fetchImpl, d.org_id) : null;
  if (warning) log('warn', 'orchard_license_sync_failed', { org_id: d.org_id, warning });
  return json({
    ok: true, instances, status: nextStatus,
    ...(gate ? { gate: { secret: gate.secret, setup: gateSetup(env, new URL(request.url).origin, { id: d.id, endpoint }, gate.secret) } } : {}),
    ...(warning ? { warning } : {}),
  });
}

// ── Router ───────────────────────────────────────────────────────────────

export async function handleOrchardApi(request: Request, env: OrchardEnv, fetchImpl: Fetch = fetch): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.replace(/^\/api\/orchard\/?/, '').split('/').filter(Boolean);
  const method = request.method;
  const route = parts.join('/');

  if (route === 'meter') {
    return method === 'POST' ? handleMeter(request, env, fetchImpl) : json({ ok: false }, 405, { Allow: 'POST' });
  }
  if (!env.ORCHARD_DB) return json({ ok: false, error: 'The console is not configured yet.' }, 503);
  if (parts[0] === 'gate' && parts[1] === 'deployments' && parts[3] === 'allowlist' && parts.length === 4) {
    return method === 'GET' ? handleGateAllowlist(request, env, parts[2]) : json({ ok: false }, 405, { Allow: 'GET' });
  }
  const session = await requireSession(request, env);
  if (!session) return json({ ok: false, error: 'Sign in first.', reason: 'signed_out' }, 401);
  if (method !== 'GET' && !sameOrigin(request)) return json({ ok: false, error: 'Cross-origin request refused.' }, 403);
  const db = env.ORCHARD_DB;

  try {
    if (route === 'me' && method === 'GET') {
      const org = await getOrg(db, session.org);
      return json({
        ok: true,
        user: { id: session.uid, email: session.email, name: session.name },
        org: org ? { id: org.id, name: org.name } : null,
        billing: { status: org?.billing_status ?? 'none', payment: org?.payment_status ?? null, active: billingActive(org), configured: billingConfigured(env), customer: Boolean(org?.stripe_customer_id) },
        admin: isAdmin(session, env),
      });
    }
    if (route === 'deployments' && method === 'GET') return await listForOrg(env, session);
    if (route === 'deployments' && method === 'POST') return await createDeployment(request, env, fetchImpl, session);
    if (parts[0] === 'deployments' && parts.length === 3 && method === 'POST' && ID.test(parts[1])) {
      const d = await getDeployment(db, session.org, parts[1]);
      if (!d) return json({ ok: false, error: 'Deployment not found.' }, 404);
      if (d.status === 'stopped' || d.status === 'rejected') return json({ ok: false, error: `This deployment is ${d.status}.` }, 409);
      if (parts[2] === 'scale') {
        const body = await readJson(request);
        const delta = Number(body?.delta);
        if (delta !== 1 && delta !== -1) return json({ ok: false, error: 'delta must be 1 or -1.' }, 400);
        const desired = d.desired_instances + delta;
        if (desired < 1 || desired > MAX_INSTANCES) return json({ ok: false, error: `Instances stay between 1 and ${MAX_INSTANCES}; use Stop to turn a deployment off.` }, 400);
        return await requestChange(env, fetchImpl, session, d, 'scale', desired);
      }
      if (parts[2] === 'stop') return await requestChange(env, fetchImpl, session, d, 'stop', 0);
    }
    if (route === 'billing/checkout' && method === 'POST') {
      const body = await readJson(request);
      return await createCheckout(env, fetchImpl, session, url.origin, safePath(text(body?.return_to), '/products/orchard/console/'));
    }
    if (route === 'billing/portal' && method === 'POST') return await createPortal(env, fetchImpl, session, url.origin);
    if (parts[0] === 'admin') {
      if (!isAdmin(session, env)) return json({ ok: false, error: 'Not an Orchard admin.' }, 403);
      if (route === 'admin/requests' && method === 'GET') return await adminList(env);
      if (parts[1] === 'requests' && parts.length === 3 && method === 'POST' && ID.test(parts[2])) return await adminUpdate(request, env, fetchImpl, session, parts[2]);
      if (parts[1] === 'deployments' && parts[3] === 'gate-secret' && parts.length === 4 && method === 'POST' && ID.test(parts[2])) {
        return await adminRotateGateSecret(request, env, session, parts[2]);
      }
    }
    return json({ ok: false, error: 'Not found.' }, 404);
  } catch (error) {
    log('error', 'orchard_api_error', { route, method, detail: String((error as Error)?.message ?? error) });
    return json({ ok: false, error: 'Something went wrong. Please try again.' }, 500);
  }
}
