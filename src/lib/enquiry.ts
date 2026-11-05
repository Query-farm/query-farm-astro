// The website's enquiry form, server side: validate a submission, check its
// Cloudflare Turnstile token, and email it to the team through Resend.
//
// Kept free of Pages Function types so it can be unit-tested with a stub
// `fetch`; functions/api/enquiry.ts is the thin route that calls it.
//
// Secrets come from the Pages project's encrypted environment variables:
//   RESEND_API_KEY        — Resend API key (query.farm is a verified domain)
//   TURNSTILE_SECRET_KEY  — Turnstile widget secret
// and two optional overrides: ENQUIRY_TO (default hello@query.farm) and
// ENQUIRY_FROM (default "Query.Farm website <website@query.farm>").

import { saveEnquiryReceipt, type EnquiryDatabase } from './enquiry-store';
import { ENQUIRY_TOPICS, type EnquiryReason } from './enquiry-tracking';
export { ENQUIRY_TOPICS } from './enquiry-tracking';

export interface EnquiryEnv {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ENQUIRY_TO?: string;
  ENQUIRY_FROM?: string;
  ENQUIRY_DB?: EnquiryDatabase;
}

export interface Enquiry {
  name: string;
  email: string;
  company: string;
  topic: (typeof ENQUIRY_TOPICS)[number];
  message: string;
  /** The page the form was sent from, for context in the email. */
  page: string;
}

type FieldErrors = Partial<Record<'name' | 'email' | 'company' | 'topic' | 'message', string>>;

const LIMITS = { name: 120, email: 254, company: 160, message: 5000 };
// Deliberately loose: one @, no spaces, a dot in the domain. Resend and the
// reply itself are the real test of an address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

export function validateEnquiry(raw: Record<string, unknown>):
  | { ok: true; enquiry: Enquiry }
  | { ok: false; errors: FieldErrors } {
  const enquiry = {
    name: text(raw.name),
    email: text(raw.email),
    company: text(raw.company),
    topic: text(raw.topic),
    message: text(raw.message),
    page: text(raw.page).slice(0, 300),
  };
  const errors: FieldErrors = {};
  if (!enquiry.name) errors.name = 'Tell us your name.';
  else if (enquiry.name.length > LIMITS.name) errors.name = 'That name is too long.';
  if (!EMAIL.test(enquiry.email) || enquiry.email.length > LIMITS.email) errors.email = 'Enter an email address we can reply to.';
  if (enquiry.company.length > LIMITS.company) errors.company = 'That company name is too long.';
  if (!(ENQUIRY_TOPICS as readonly string[]).includes(enquiry.topic)) errors.topic = 'Choose what this is about.';
  if (enquiry.message.length < 10) errors.message = 'Tell us a little more about what you need.';
  else if (enquiry.message.length > LIMITS.message) errors.message = `Keep it under ${LIMITS.message.toLocaleString('en-US')} characters, or email us instead.`;
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, enquiry: enquiry as Enquiry };
}

export function enquiryEmail(enquiry: Enquiry, to: string, from: string) {
  const who = enquiry.company ? `${enquiry.name} (${enquiry.company})` : enquiry.name;
  return {
    from,
    to: [to],
    reply_to: enquiry.email,
    subject: `${enquiry.topic}: inquiry from ${who}`,
    text: [
      `Name:    ${enquiry.name}`,
      `Email:   ${enquiry.email}`,
      `Company: ${enquiry.company || '—'}`,
      `Topic:   ${enquiry.topic}`,
      `Page:    ${enquiry.page || '—'}`,
      '',
      enquiry.message,
      '',
      '— Sent from the query.farm contact form. Reply to answer the sender directly.',
    ].join('\n'),
  };
}

type Fetch = typeof fetch;

export async function verifyTurnstile(token: string, secret: string, ip: string | null, fetchImpl: Fetch): Promise<{ ok: true } | { ok: false; reason: EnquiryReason }> {
  if (!token) return { ok: false, reason: 'turnstile_missing' };
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return { ok: false, reason: 'turnstile_unavailable' };
    const result = (await response.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (result.success === true) return { ok: true };
    const codes = Array.isArray(result['error-codes']) ? result['error-codes'] : [];
    return { ok: false, reason: codes.includes('timeout-or-duplicate') ? 'turnstile_expired'
      : codes.some(code => ['internal-error', 'invalid-input-secret', 'missing-input-secret'].includes(code))
        ? 'turnstile_unavailable' : 'turnstile_rejected' };
  } catch {
    return { ok: false, reason: 'turnstile_unavailable' };
  }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** The whole POST /api/enquiry exchange. Responses are JSON: `{ok: true}` or `{ok: false, error, errors?}`. */
export async function handleEnquiry(request: Request, env: EnquiryEnv, fetchImpl: Fetch = fetch): Promise<Response> {
  const enquiryId = crypto.randomUUID();
  const failure = (reason: EnquiryReason, error: string, status: number, errors?: FieldErrors, providerStatus?: number) => {
    console.warn(JSON.stringify({ event: 'enquiry_rejected', enquiry_id: enquiryId, reason, ...(providerStatus ? { provider_status: providerStatus } : {}) }));
    return json({ ok: false, enquiry_id: enquiryId, reason, error, ...(errors ? { errors } : {}) }, status);
  };
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
    return failure('configuration', 'The form is not configured yet. Please email hello@query.farm.', 503);
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Expected an object');
  } catch {
    return failure('invalid_request', 'The form could not be read. Please try again.', 400);
  }
  // Honeypot: a field people never see. Bots that fill it get a quiet success.
  if (text(raw.qf_hp)) {
    console.warn(JSON.stringify({ event: 'enquiry_dropped', enquiry_id: enquiryId, reason: 'honeypot' }));
    // Quiet acknowledgement, explicitly not an accepted lead.
    return json({ ok: true, accepted: false }, 200);
  }

  const checked = validateEnquiry(raw);
  if (!checked.ok) return failure('validation', 'Check the highlighted fields.', 400, checked.errors);

  const ip = request.headers.get('CF-Connecting-IP');
  const verification = await verifyTurnstile(text(raw.turnstileToken), env.TURNSTILE_SECRET_KEY, ip, fetchImpl);
  if (!verification.ok) {
    return failure(verification.reason, 'The security check did not complete. Try the security check again, then resend your message.', 403);
  }

  const email = enquiryEmail(checked.enquiry, env.ENQUIRY_TO || 'hello@query.farm', env.ENQUIRY_FROM || 'Query.Farm website <website@query.farm>');
  let resendId: string;
  let resendStatus: number | undefined;
  try {
    const sent = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...email, tags: [{ name: 'source', value: 'website_enquiry' }, { name: 'enquiry_id', value: enquiryId }] }),
      signal: AbortSignal.timeout(15_000),
    });
    resendStatus = sent.status;
    if (!sent.ok) throw new Error(`Resend answered ${sent.status}`);
    const result = await sent.json() as { id?: unknown };
    if (typeof result.id !== 'string' || !/^[0-9a-f-]{36}$/i.test(result.id)) throw new Error('Missing Resend email ID');
    resendId = result.id;
  } catch {
    return failure('send_failed', 'We could not confirm your message was sent. Please email hello@query.farm instead.', 502, undefined, resendStatus);
  }
  const receipt = { enquiryId, resendId, acceptedAt: new Date().toISOString() };
  console.info(JSON.stringify({ event: 'enquiry_accepted', enquiry_id: enquiryId, resend_id: resendId }));
  if (env.ENQUIRY_DB) {
    try {
      await saveEnquiryReceipt(env.ENQUIRY_DB, receipt);
    } catch {
      // The email was accepted. A monitoring outage must not invite a duplicate
      // send. Signed webhook tags can reconstruct the missing receipt later.
      console.error(JSON.stringify({ event: 'enquiry_monitoring_gap', enquiry_id: enquiryId, resend_id: resendId, reason: 'storage_failed' }));
    }
  } else {
    console.error(JSON.stringify({ event: 'enquiry_monitoring_gap', enquiry_id: enquiryId, resend_id: resendId, reason: 'storage_not_configured' }));
  }
  // Resend IDs stay server-side. This ID joins analytics to the private receipt.
  return json({ ok: true, accepted: true, enquiry_id: enquiryId }, 200);
}
