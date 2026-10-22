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

export interface EnquiryEnv {
  RESEND_API_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  ENQUIRY_TO?: string;
  ENQUIRY_FROM?: string;
}

/** What the visitor can say they need; the form's <select> uses the same list. */
export const ENQUIRY_TOPICS = [
  'Consulting',
  'A custom DuckDB extension',
  'VGI',
  'Haybarn',
  'Something else',
] as const;

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

export async function verifyTurnstile(token: string, secret: string, ip: string | null, fetchImpl: Fetch): Promise<boolean> {
  if (!token) return false;
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  try {
    const response = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

/** The whole POST /api/enquiry exchange. Responses are JSON: `{ok: true}` or `{ok: false, error, errors?}`. */
export async function handleEnquiry(request: Request, env: EnquiryEnv, fetchImpl: Fetch = fetch): Promise<Response> {
  if (!env.RESEND_API_KEY || !env.TURNSTILE_SECRET_KEY) {
    return json({ ok: false, error: 'The form is not configured yet. Please email hello@query.farm.' }, 503);
  }
  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'The form could not be read. Please try again.' }, 400);
  }
  // Honeypot: a field people never see. Bots that fill it get a quiet success.
  if (text(raw.website)) return json({ ok: true }, 200);

  const checked = validateEnquiry(raw);
  if (!checked.ok) return json({ ok: false, error: 'Check the highlighted fields.', errors: checked.errors }, 400);

  const ip = request.headers.get('CF-Connecting-IP');
  if (!(await verifyTurnstile(text(raw.turnstileToken), env.TURNSTILE_SECRET_KEY, ip, fetchImpl))) {
    return json({ ok: false, error: 'We could not confirm you are not a bot. Reload the page and try again.' }, 403);
  }

  const email = enquiryEmail(checked.enquiry, env.ENQUIRY_TO || 'hello@query.farm', env.ENQUIRY_FROM || 'Query.Farm website <website@query.farm>');
  try {
    const sent = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(email),
    });
    if (!sent.ok) throw new Error(`Resend answered ${sent.status}`);
  } catch {
    return json({ ok: false, error: 'Your message could not be sent. Please email hello@query.farm instead.' }, 502);
  }
  return json({ ok: true }, 200);
}
