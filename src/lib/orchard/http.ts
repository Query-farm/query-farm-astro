// Shared plumbing for the hosted Orchard Functions: the env they read, JSON
// responses, cookies and structured logs. Kept free of Pages Function types so
// every module can be unit-tested in Node with a stub `fetch` and D1.

import type { OrchardDatabase } from './db';

export type Fetch = typeof fetch;

/** Everything is optional: a route answers 503 when a secret it needs is missing. */
export interface OrchardEnv {
  ORCHARD_DB?: OrchardDatabase;
  /** ≥ 32 characters; keys the AES-GCM session cookie. */
  SESSION_SECRET?: string;
  WORKOS_CLIENT_ID?: string;
  WORKOS_API_KEY?: string;
  /** Defaults to `<origin>/api/auth/callback`. */
  WORKOS_REDIRECT_URI?: string;
  /** Public OAuth client for DuckDB ATTACH; printed into the gate's Fly setup. */
  WORKOS_VGI_CLIENT_ID?: string;
  /** AuthKit issuer, e.g. https://<subdomain>.authkit.app; printed into the gate's Fly setup. */
  WORKOS_AUTHKIT_DOMAIN?: string;
  RESEND_API_KEY?: string;
  /** Where lead and request emails go (default hello@query.farm). */
  ORCHARD_NOTIFY_TO?: string;
  ORCHARD_NOTIFY_FROM?: string;
  /** Comma-separated, verified email addresses allowed into /console/admin. */
  ORCHARD_ADMINS?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_S?: string;
  STRIPE_PRICE_M?: string;
  STRIPE_PRICE_L?: string;
  STRIPE_PRICE_LICENSE?: string;
  /** Bearer token the daily meter Action presents to /api/orchard/meter. */
  ORCHARD_METER_TOKEN?: string;
  /** Pages static assets, used to read the hosted worker list. */
  ASSETS?: { fetch(input: Request | string | URL, init?: RequestInit): Promise<Response> };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });

export const redirect = (location: string, cookies: string[] = []) => {
  const headers = new Headers({ Location: location, 'Cache-Control': 'no-store' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 302, headers });
};

export const log = (level: 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}) =>
  console[level](JSON.stringify({ event, ...fields }));

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

/** Secure everywhere except plain-http localhost (`wrangler pages dev`). */
export function cookie(request: Request, name: string, value: string, maxAge: number, path = '/') {
  const url = new URL(request.url);
  const secure = !(url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'));
  return `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** A same-site relative path, or the fallback. Blocks `//evil` and `/\evil`. */
export function safePath(value: string | null | undefined, fallback: string): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.length > 500) return fallback;
  return value;
}

export const text = (value: unknown, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

/** Constant-time string comparison over SHA-256 digests. */
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const ua = new Uint8Array(x), ub = new Uint8Array(y);
  let diff = a.length === b.length ? 0 : 1;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export const nowIso = () => new Date().toISOString();
