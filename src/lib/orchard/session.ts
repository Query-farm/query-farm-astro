// Sealed cookies: AES-GCM with a key derived from SESSION_SECRET. The cookie
// name is bound as additional authenticated data, so a sealed OAuth-state
// cookie can't be replayed as a session and vice versa.

import { cookie, readCookie, type OrchardEnv } from './http';

export const SESSION_COOKIE = 'qf_session';
export const OAUTH_COOKIE = 'qf_oauth';
export const SESSION_MAX_AGE = 14 * 24 * 3600;

export interface Session {
  /** WorkOS user id. */
  uid: string;
  email: string;
  /** WorkOS reported the email as verified (admin access requires it). */
  ev: boolean;
  name: string;
  /** WorkOS organization id. */
  org: string;
  /** WorkOS refresh token, scoped to `org`. */
  rt: string;
  /** WorkOS session id (`sid` claim), for sign-out. */
  sid?: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
}

const enc = new TextEncoder();
const keys = new Map<string, Promise<CryptoKey>>();

function aesKey(secret: string): Promise<CryptoKey> {
  let key = keys.get(secret);
  if (!key) {
    key = crypto.subtle.digest('SHA-256', enc.encode(`qf-orchard-session-v1:${secret}`))
      .then(raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']));
    keys.set(secret, key);
  }
  return key;
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

export const secretUsable = (secret: string | undefined): secret is string => typeof secret === 'string' && secret.length >= 32;

export async function seal(value: unknown, secret: string, purpose: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(purpose) }, await aesKey(secret), enc.encode(JSON.stringify(value))));
  const out = new Uint8Array(iv.length + sealed.length);
  out.set(iv); out.set(sealed, iv.length);
  return `v1.${b64url(out)}`;
}

export async function unseal<T>(token: string | null, secret: string, purpose: string): Promise<T | null> {
  if (!token || !token.startsWith('v1.') || token.length > 4000) return null;
  try {
    const bytes = unb64url(token.slice(3));
    if (bytes.length < 12 + 16) return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode(purpose) }, await aesKey(secret), bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch { return null; }
}

export async function sessionCookie(request: Request, session: Session, secret: string): Promise<string> {
  return cookie(request, SESSION_COOKIE, await seal(session, secret, SESSION_COOKIE), SESSION_MAX_AGE);
}

export const clearSessionCookie = (request: Request) => cookie(request, SESSION_COOKIE, '', 0);

/** The signed-in session, or null when missing, tampered with or expired. */
export async function requireSession(request: Request, env: OrchardEnv, now = Date.now()): Promise<Session | null> {
  if (!secretUsable(env.SESSION_SECRET)) return null;
  const session = await unseal<Session>(readCookie(request, SESSION_COOKIE), env.SESSION_SECRET, SESSION_COOKIE);
  if (!session || typeof session.uid !== 'string' || typeof session.org !== 'string' || typeof session.exp !== 'number') return null;
  return session.exp * 1000 > now ? session : null;
}

export function isAdmin(session: Session, env: OrchardEnv): boolean {
  if (!session.ev) return false;
  const admins = (env.ORCHARD_ADMINS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return admins.includes(session.email.toLowerCase());
}
