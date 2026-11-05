/** Shared, deliberately small vocabulary: never put submitted text in analytics. */
export const ENQUIRY_TOPICS = [
  'Consulting', 'A custom DuckDB extension', 'VGI', 'Haybarn', 'Something else',
] as const;

export const ENQUIRY_REASONS = [
  'configuration', 'invalid_request', 'validation', 'turnstile_missing',
  'turnstile_expired', 'turnstile_rejected', 'turnstile_unavailable',
  'turnstile_widget', 'send_failed', 'network', 'unexpected_response',
] as const;
export type EnquiryReason = (typeof ENQUIRY_REASONS)[number];
export const ENQUIRY_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function enquiryReason(value: unknown): EnquiryReason {
  return typeof value === 'string' && (ENQUIRY_REASONS as readonly string[]).includes(value)
    ? value as EnquiryReason : 'unexpected_response';
}

type EventName = 'enquiry_start' | 'enquiry_submit' | 'enquiry_accepted' | 'enquiry_error' | 'generate_lead';
type Runtime = { location: { hostname: string }; gtag?: (...args: unknown[]) => void };

export function trackEnquiry(
  event: EventName,
  details: { reason?: unknown; enquiry_id?: unknown; topic?: unknown } = {},
  runtime: Runtime = window as unknown as Runtime,
): boolean {
  if (!['query.farm', 'www.query.farm'].includes(runtime.location.hostname) || typeof runtime.gtag !== 'function') return false;
  const params: Record<string, string> = { form_id: 'enquiry', transport_type: 'beacon' };
  if (event === 'enquiry_error') params.reason = enquiryReason(details.reason);
  if (typeof details.enquiry_id === 'string' && ENQUIRY_ID.test(details.enquiry_id)) params.enquiry_id = details.enquiry_id;
  if (typeof details.topic === 'string' && (ENQUIRY_TOPICS as readonly string[]).includes(details.topic)) params.topic = details.topic;
  // Explicit fields only: no form values, free-form errors or Resend email IDs.
  try {
    runtime.gtag('event', event, params);
    return true;
  } catch {
    // Analytics must never turn an accepted enquiry into a visible send error.
    return false;
  }
}
