// WorkOS AuthKit sign-in for the hosted Orchard console, with plain fetch
// rather than the WorkOS SDK (it keeps the Pages Functions bundle small).
//
//   GET /api/auth/login     → AuthKit hosted UI (authorization-code flow)
//   GET /api/auth/callback  → code exchange, organisation, lead, session cookie
//   GET /api/auth/logout    → clear the cookie, end the WorkOS session
//
// On a person's first sign-in we create a personal workspace for them (a
// WorkOS Organization with them as admin), record a lead row and email the team. The session is an
// AES-GCM sealed cookie (src/lib/orchard/session.ts).

import { getOrg, orgForUser, upsertOrgAndMember } from './db';
import { cookie, json, log, nowIso, readCookie, redirect, safePath, type Fetch, type OrchardEnv } from './http';
import { notifyTeam } from './notify';
import {
  OAUTH_COOKIE, SESSION_MAX_AGE, clearSessionCookie, requireSession, seal, secretUsable, sessionCookie, unseal, type Session,
} from './session';

export const WORKOS_API = 'https://api.workos.com';
export const CONSOLE_PATH = '/products/orchard/console/';

interface OAuthState {
  state: string;
  returnTo: string;
  source: string;
  worker: string;
  exp: number;
}

interface WorkOSUser {
  id: string;
  email: string;
  email_verified?: boolean;
  first_name?: string | null;
  last_name?: string | null;
}

interface WorkOSAuth {
  user: WorkOSUser;
  organization_id?: string | null;
  access_token: string;
  refresh_token: string;
}

const configured = (env: OrchardEnv) =>
  Boolean(env.WORKOS_CLIENT_ID && env.WORKOS_API_KEY && secretUsable(env.SESSION_SECRET) && env.ORCHARD_DB);

const notConfigured = () =>
  json({ ok: false, error: 'Sign-in is not configured yet. Please email hello@query.farm.' }, 503);

const redirectUri = (request: Request, env: OrchardEnv) =>
  env.WORKOS_REDIRECT_URI || new URL('/api/auth/callback', request.url).toString();

const displayName = (user: WorkOSUser) => [user.first_name, user.last_name].filter(Boolean).join(' ').trim();

/** The `sid` claim of a WorkOS access token. Read without verification: the token came straight from WorkOS over TLS. */
export function accessTokenClaim(token: string, claim: string): string | undefined {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>;
    return typeof payload[claim] === 'string' ? payload[claim] as string : undefined;
  } catch { return undefined; }
}

/**
 * Every new user gets a personal workspace: a WorkOS Organization named after
 * them, with them as admin. Workspaces are the billing and ownership unit (one
 * Stripe customer each) and their members are a deployment's allow-list.
 */
export function defaultOrgName(user: WorkOSUser): string {
  const who = displayName(user) || user.email.split('@')[0];
  return `${who}'s workspace`;
}

async function workos(env: OrchardEnv, fetchImpl: Fetch, path: string, init: { method?: string; body?: unknown } = {}) {
  const response = await fetchImpl(`${WORKOS_API}${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: { Authorization: `Bearer ${env.WORKOS_API_KEY}`, 'Content-Type': 'application/json' },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  let body: Record<string, unknown> = {};
  try { body = await response.json() as Record<string, unknown>; } catch { /* empty or non-JSON */ }
  return { ok: response.ok, status: response.status, body };
}

const authenticate = (env: OrchardEnv, fetchImpl: Fetch, grant: Record<string, string>) =>
  workos(env, fetchImpl, '/user_management/authenticate', {
    body: { client_id: env.WORKOS_CLIENT_ID, client_secret: env.WORKOS_API_KEY, ...grant },
  });

/** GET /api/auth/login?return_to=…&worker=…&source=…&signup=1 */
export async function handleLogin(request: Request, env: OrchardEnv): Promise<Response> {
  if (!configured(env)) return notConfigured();
  const url = new URL(request.url);
  const state = crypto.randomUUID();
  const pending: OAuthState = {
    state,
    returnTo: safePath(url.searchParams.get('return_to'), CONSOLE_PATH),
    source: safePath(url.searchParams.get('source'), ''),
    worker: (url.searchParams.get('worker') ?? '').replace(/[^a-z0-9-]/gi, '').slice(0, 80),
    exp: Math.floor(Date.now() / 1000) + 600,
  };
  const authorize = new URL(`${WORKOS_API}/user_management/authorize`);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', env.WORKOS_CLIENT_ID!);
  authorize.searchParams.set('redirect_uri', redirectUri(request, env));
  authorize.searchParams.set('provider', 'authkit');
  authorize.searchParams.set('state', state);
  if (url.searchParams.get('signup') === '1') authorize.searchParams.set('screen_hint', 'sign-up');
  const sealed = await seal(pending, env.SESSION_SECRET!, OAUTH_COOKIE);
  return redirect(authorize.toString(), [cookie(request, OAUTH_COOKIE, sealed, 600, '/api/auth')]);
}

/**
 * Settle which organisation this sign-in is for. WorkOS answers with an
 * `organization_id` when the user belongs to exactly one; with an
 * `organization_selection_required` error when they belong to several; and
 * with neither for a brand-new user, for whom we create one.
 */
async function resolveOrganization(env: OrchardEnv, fetchImpl: Fetch, auth: WorkOSAuth): Promise<{ auth: WorkOSAuth; orgId: string; orgName: string; created: boolean }> {
  const db = env.ORCHARD_DB!;
  let orgId = auth.organization_id ?? null;
  let created = false;
  let orgName = '';
  if (!orgId) orgId = (await orgForUser(db, auth.user.id))?.org_id ?? null;
  if (!orgId) {
    orgName = defaultOrgName(auth.user);
    const org = await workos(env, fetchImpl, '/organizations', { body: { name: orgName } });
    if (!org.ok || typeof org.body.id !== 'string') throw new Error(`WorkOS organization create answered ${org.status}`);
    orgId = org.body.id;
    const membership = await workos(env, fetchImpl, '/user_management/organization_memberships', {
      body: { user_id: auth.user.id, organization_id: orgId, role_slug: 'admin' },
    });
    if (!membership.ok) throw new Error(`WorkOS membership create answered ${membership.status}`);
    created = true;
    log('info', 'orchard_org_created', { org_id: orgId, user_id: auth.user.id });
  }
  if (!orgName) {
    const known = await getOrg(db, orgId);
    if (known) orgName = known.name;
    else {
      const org = await workos(env, fetchImpl, `/organizations/${encodeURIComponent(orgId)}`);
      orgName = org.ok && typeof org.body.name === 'string' ? org.body.name : defaultOrgName(auth.user);
    }
  }
  // Re-scope the site session's tokens to the workspace. (The hosted gate
  // doesn't rely on this: tokens issued to the VGI app never carry `org_id`,
  // so it authorises by a user allow-list from /api/orchard/gate/….) Keep the
  // original tokens if WorkOS declines; console access is decided by D1.
  if (auth.organization_id !== orgId) {
    const scoped = await authenticate(env, fetchImpl, { grant_type: 'refresh_token', refresh_token: auth.refresh_token, organization_id: orgId });
    if (scoped.ok && typeof scoped.body.refresh_token === 'string' && typeof scoped.body.access_token === 'string') {
      auth = { ...auth, access_token: scoped.body.access_token, refresh_token: scoped.body.refresh_token, organization_id: orgId };
    } else {
      log('warn', 'orchard_org_scope_failed', { org_id: orgId, provider_status: scoped.status });
    }
  }
  return { auth, orgId, orgName, created };
}

/** GET /api/auth/callback?code=…&state=… */
export async function handleCallback(request: Request, env: OrchardEnv, fetchImpl: Fetch = fetch): Promise<Response> {
  if (!configured(env)) return notConfigured();
  const url = new URL(request.url);
  const clearOAuth = cookie(request, OAUTH_COOKIE, '', 0, '/api/auth');
  const pending = await unseal<OAuthState>(readCookie(request, OAUTH_COOKIE), env.SESSION_SECRET!, OAUTH_COOKIE);
  const fail = (reason: string, status = 400, fields: Record<string, unknown> = {}) => {
    log('warn', 'orchard_signin_failed', { reason, ...fields });
    return new Response(`Sign-in did not complete (${reason}). Please try again from ${new URL(CONSOLE_PATH, request.url)}`, {
      status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearOAuth },
    });
  };
  if (url.searchParams.get('error')) return fail('provider_error');
  const code = url.searchParams.get('code');
  if (!pending || pending.exp * 1000 < Date.now() || !code || url.searchParams.get('state') !== pending.state) return fail('state_mismatch');

  let exchanged = await authenticate(env, fetchImpl, { grant_type: 'authorization_code', code });
  // A member of several organisations: continue with one we already know, else the first.
  if (!exchanged.ok && exchanged.body.code === 'organization_selection_required' && typeof exchanged.body.pending_authentication_token === 'string') {
    const options = Array.isArray(exchanged.body.organizations) ? exchanged.body.organizations as { id?: unknown }[] : [];
    const user = exchanged.body.user as WorkOSUser | undefined;
    const known = user ? (await orgForUser(env.ORCHARD_DB!, user.id))?.org_id : undefined;
    const choice = options.find(o => o.id === known)?.id ?? options[0]?.id;
    if (typeof choice !== 'string') return fail('organization_selection', 502);
    exchanged = await authenticate(env, fetchImpl, {
      grant_type: 'urn:workos:oauth:grant-type:organization-selection',
      pending_authentication_token: exchanged.body.pending_authentication_token,
      organization_id: choice,
    });
  }
  const body = exchanged.body as unknown as WorkOSAuth;
  if (!exchanged.ok || !body.user?.id || !body.user.email || !body.refresh_token || !body.access_token) {
    return fail('code_exchange', 502, { provider_status: exchanged.status });
  }

  let resolved: Awaited<ReturnType<typeof resolveOrganization>>;
  try { resolved = await resolveOrganization(env, fetchImpl, body); }
  catch (error) { return fail('organization', 502, { detail: String((error as Error).message) }); }
  const { auth, orgId, orgName } = resolved;
  const user = auth.user;
  const name = displayName(user);
  const at = nowIso();
  const db = env.ORCHARD_DB!;
  try { await upsertOrgAndMember(db, { id: orgId, name: orgName }, { userId: user.id, email: user.email, name }, at); }
  catch { return fail('storage', 503); }

  // A lead the first time we see this person.
  const leadId = crypto.randomUUID();
  const lead = await db.prepare(`INSERT INTO leads (id, user_id, email, name, org_id, source_page, worker, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id) DO NOTHING`)
    .bind(leadId, user.id, user.email, name || null, orgId, pending.source || null, pending.worker || null, at).run();
  if ((lead.meta?.changes ?? 0) > 0) {
    log('info', 'orchard_lead', { lead_id: leadId, org_id: orgId, worker: pending.worker || null });
    const resendId = await notifyTeam(env, {
      tag: 'lead',
      subject: `Orchard sign-up: ${name || user.email}${pending.worker ? ` (${pending.worker})` : ''}`,
      replyTo: user.email,
      lines: [
        `Name:         ${name || '—'}`,
        `Email:        ${user.email}${user.email_verified ? ' (verified)' : ''}`,
        `Workspace:    ${orgName} (${orgId})${resolved.created ? ' — created now' : ''}`,
        `Worker:       ${pending.worker || '—'}`,
        `Source page:  ${pending.source || '—'}`,
      ],
    }, fetchImpl);
    if (resendId) await db.prepare('UPDATE leads SET resend_id = ? WHERE id = ?').bind(resendId, leadId).run();
  }

  const session: Session = {
    uid: user.id, email: user.email, ev: user.email_verified === true, name, org: orgId, rt: auth.refresh_token,
    sid: accessTokenClaim(auth.access_token, 'sid'), exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  log('info', 'orchard_signin', { user_id: user.id, org_id: orgId });
  return redirect(new URL(pending.returnTo, request.url).toString(), [await sessionCookie(request, session, env.SESSION_SECRET!), clearOAuth]);
}

/** GET /api/auth/logout */
export async function handleLogout(request: Request, env: OrchardEnv): Promise<Response> {
  const session = await requireSession(request, env);
  const home = new URL('/products/orchard/', request.url).toString();
  const target = session?.sid
    ? `${WORKOS_API}/user_management/sessions/logout?session_id=${encodeURIComponent(session.sid)}&return_to=${encodeURIComponent(home)}`
    : home;
  return redirect(target, [clearSessionCookie(request)]);
}

