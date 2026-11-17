// The hosted OAuth gate's view of Orchard.
//
// Each Fly deployment runs a gate in front of the worker. DuckDB signs in
// through WorkOS (the public VGI client) and presents the access token; the
// gate validates it (issuer = AuthKit domain, `aud` = WORKOS_CLIENT_ID) and
// then authorises by **user**: tokens issued to the VGI app never carry
// `org_id`, so the gate fetches the deployment's allow-list of WorkOS user ids
// (`sub`) from
//
//   GET /api/orchard/gate/deployments/:id/allowlist
//   Authorization: Bearer <GATE_DEPLOYMENT_SECRET>
//   → {"deployment_id": "dep_…", "allowed_subs": ["user_…", …]}
//
// The allow-list is the members of the deployment's workspace. The secret is
// generated when Rusty marks the deployment live, shown once in the admin
// tracker, and stored only as a SHA-256 hash.

import type { DeploymentRow } from './db';
import { json, log, timingSafeEqual, type OrchardEnv } from './http';

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('');

export const sha256Hex = async (value: string) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));

/** A fresh gate secret and the hash to store. */
export async function newGateSecret(): Promise<{ secret: string; hash: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = `qfg_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
  return { secret, hash: await sha256Hex(secret) };
}

export const allowlistUrl = (origin: string, deploymentId: string) =>
  `${origin}/api/orchard/gate/deployments/${deploymentId}/allowlist`;

/** The Fly app name for a `https://<app>.fly.dev` endpoint, else a placeholder. */
export function flyApp(endpoint: string | null): string {
  try {
    const host = new URL(endpoint ?? '').hostname;
    if (host.endsWith('.fly.dev')) return host.slice(0, -'.fly.dev'.length);
  } catch { /* not a URL */ }
  return '<fly-app>';
}

/** The gate's fly.toml [env] block and the `fly secrets set` line, exactly as Rusty pastes them. */
export function gateSetup(env: OrchardEnv, origin: string, d: Pick<DeploymentRow, 'id' | 'endpoint'>, secret: string): string {
  const q = (v: string) => JSON.stringify(v);
  return [
    '# fly.toml',
    '[env]',
    `  GATE_UPSTREAM = ${q('http://127.0.0.1:8000')}  # the worker's --http listener in the same Machine`,
    `  GATE_RESOURCE = ${q(d.endpoint ?? '<endpoint>')}`,
    `  GATE_AUTH_SERVER = ${q(env.WORKOS_AUTHKIT_DOMAIN || '<WORKOS_AUTHKIT_DOMAIN>')}`,
    `  GATE_CLIENT_ID = ${q(env.WORKOS_VGI_CLIENT_ID || '<WORKOS_VGI_CLIENT_ID>')}`,
    `  GATE_AUDIENCE = ${q(env.WORKOS_CLIENT_ID || '<WORKOS_CLIENT_ID>')}`,
    `  GATE_AUTHZ = ${q('allowlist')}`,
    `  GATE_ALLOWLIST_URL = ${q(allowlistUrl(origin, d.id))}`,
    '',
    `fly secrets set GATE_DEPLOYMENT_SECRET=${secret} --app ${flyApp(d.endpoint)}`,
  ].join('\n');
}

/** GET /api/orchard/gate/deployments/:id/allowlist */
export async function handleGateAllowlist(request: Request, env: OrchardEnv, deploymentId: string): Promise<Response> {
  const db = env.ORCHARD_DB!;
  const auth = request.headers.get('Authorization') ?? '';
  const presented = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const deployment = await db.prepare('SELECT id, org_id, status, gate_secret_hash FROM deployments WHERE id = ?')
    .bind(deploymentId).first<Pick<DeploymentRow, 'id' | 'org_id' | 'status' | 'gate_secret_hash'>>();
  // Hash and compare even when the deployment or its secret is missing, so
  // timing doesn't reveal which deployment ids exist.
  const ok = await timingSafeEqual(await sha256Hex(presented), deployment?.gate_secret_hash ?? 'no-secret');
  if (!presented || !deployment?.gate_secret_hash || !ok) {
    log('warn', 'orchard_gate_denied', { deployment_id: deploymentId, reason: presented ? 'bad_secret' : 'missing_secret' });
    return json({ ok: false, error: 'Unauthorized.' }, 401, { 'WWW-Authenticate': 'Bearer' });
  }
  // A stopped or rejected deployment admits nobody.
  const active = deployment.status === 'live' || deployment.status === 'provisioning';
  const subs = active
    ? (await db.prepare('SELECT user_id FROM members WHERE org_id = ? ORDER BY user_id').bind(deployment.org_id).all<{ user_id: string }>()).results.map(r => r.user_id)
    : [];
  return json({ deployment_id: deployment.id, allowed_subs: subs });
}
