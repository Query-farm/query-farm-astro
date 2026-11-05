import { DELIVERY_EVENTS, saveDeliveryEvent, type DeliveryEvent, type EnquiryDatabase } from './enquiry-store';
import { ENQUIRY_ID } from './enquiry-tracking';

export interface EnquiryWebhookEnv {
  RESEND_WEBHOOK_SECRET?: string;
  ENQUIRY_DB?: EnquiryDatabase;
}

const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
const isoDate = (value: unknown): string | null =>
  typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value))
    ? new Date(value).toISOString() : null;
const base64 = (value: string): Uint8Array<ArrayBuffer> => {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid base64');
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
};

/** Svix v1 verification, using Web Crypto constant-time HMAC verification.
 * https://docs.svix.com/receiving/verifying-payloads/how-manual
 * Verify the untouched bytes before decoding JSON. Five-minute timestamp
 * tolerance limits replays; the D1 webhook primary key deduplicates retries.
 */
export async function verifyResendWebhook(body: Uint8Array, headers: Headers, secret: string, now = Date.now()): Promise<boolean> {
  const id = headers.get('svix-id') ?? '';
  const timestamp = headers.get('svix-timestamp') ?? '';
  const signatures = headers.get('svix-signature') ?? '';
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(id) || !/^\d{1,12}$/.test(timestamp)
    || Math.abs(now / 1000 - Number(timestamp)) > 300 || !secret.startsWith('whsec_')) return false;
  try {
    const keyBytes = base64(secret.slice(6));
    if (keyBytes.length < 16) return false;
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const prefix = new TextEncoder().encode(`${id}.${timestamp}.`);
    const signed = new Uint8Array(prefix.length + body.length);
    signed.set(prefix); signed.set(body, prefix.length);
    for (const signature of signatures.split(/\s+/)) {
      if (!signature.startsWith('v1,')) continue;
      try {
        if (await crypto.subtle.verify('HMAC', key, base64(signature.slice(3)), signed)) return true;
      } catch { /* Other signatures may be valid during key rotation. */ }
    }
  } catch { /* Invalid signatures or malformed signing-secret configuration. */ }
  return false;
}

export async function handleEnquiryWebhook(request: Request, env: EnquiryWebhookEnv): Promise<Response> {
  if (!env.RESEND_WEBHOOK_SECRET || !env.ENQUIRY_DB) return json({ ok: false, error: 'Delivery monitoring is not configured.' }, 503);
  // Do not retain or log raw webhook bodies: they contain recipients/subjects.
  const limit = 64 * 1024;
  if (Number(request.headers.get('content-length') ?? 0) > limit) return json({ ok: false }, 413);
  let bytes: Uint8Array;
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ ok: false }, 400);
    const chunks: Uint8Array[] = []; let length = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) { await reader.cancel(); return json({ ok: false }, 413); }
      chunks.push(value);
    }
    bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  } catch { return json({ ok: false }, 400); }
  if (!await verifyResendWebhook(bytes, request.headers, env.RESEND_WEBHOOK_SECRET)) return json({ ok: false, error: 'Invalid signature.' }, 401);

  let event: Record<string, unknown> | null;
  try { event = object(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))); }
  catch { return json({ ok: false }, 400); }
  if (!event || typeof event.type !== 'string') return json({ ok: false }, 400);
  if (!(DELIVERY_EVENTS as readonly string[]).includes(event.type)) return json({ ok: true, ignored: true }, 200);
  const data = object(event.data);
  const occurredAt = isoDate(event.created_at);
  const acceptedAt = isoDate(data?.created_at);
  const resendId = data?.email_id;
  if (!data || typeof resendId !== 'string' || !/^[0-9a-f-]{36}$/i.test(resendId) || !occurredAt || !acceptedAt) return json({ ok: false }, 400);
  const tags = object(data.tags);

  try {
    // Match an existing receipt, or the tags added by this form. Other email
    // traffic in this Resend account never enters the enquiry database.
    const receipt = await env.ENQUIRY_DB.prepare('SELECT enquiry_id FROM enquiry_messages WHERE resend_id = ?')
      .bind(resendId).first<{ enquiry_id: string }>();
    const enquiryId = receipt?.enquiry_id ?? (tags?.source === 'website_enquiry' && typeof tags.enquiry_id === 'string'
      && ENQUIRY_ID.test(tags.enquiry_id) ? tags.enquiry_id : null);
    if (!enquiryId) return json({ ok: true, ignored: true }, 200);
    const inserted = await saveDeliveryEvent(env.ENQUIRY_DB, {
      enquiryId, resendId, acceptedAt, webhookId: request.headers.get('svix-id')!,
      type: event.type as DeliveryEvent, occurredAt, receivedAt: new Date().toISOString(),
    });
    if (inserted) {
      const log = { event: 'enquiry_delivery', enquiry_id: enquiryId, resend_id: resendId, status: event.type };
      if (['email.bounced', 'email.failed', 'email.suppressed', 'email.complained'].includes(event.type)) console.error(JSON.stringify(log));
      else if (event.type === 'email.delivery_delayed') console.warn(JSON.stringify(log));
      else console.info(JSON.stringify(log));
    }
    return json({ ok: true }, 200);
  } catch {
    // A non-2xx response makes Resend retry instead of losing the event.
    console.error(JSON.stringify({ event: 'enquiry_monitoring_gap', reason: 'webhook_storage_failed', resend_id: resendId }));
    return json({ ok: false, error: 'Delivery event could not be saved.' }, 503);
  }
}
