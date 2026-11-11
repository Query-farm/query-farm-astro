type Runtime = { location: { hostname: string }; gtag?: (...args: unknown[]) => void };
type CalEvent = { detail?: { data?: unknown } };
export type CalNamespace = (command: 'on', options: { action: string; callback: (event: CalEvent) => void }) => void;
type BookingEvent = 'booking_ready' | 'booking_start' | 'booking_error' | 'booking_external_click'
  | 'booking_requested' | 'booking_result_unknown' | 'book_call';

function track(event: BookingEvent, status: string | undefined, runtime: Runtime): boolean {
  if (!['query.farm', 'www.query.farm'].includes(runtime.location.hostname) || typeof runtime.gtag !== 'function') return false;
  try {
    runtime.gtag('event', event, { method: 'cal.com', transport_type: 'beacon', ...(status ? { booking_status: status } : {}) });
    return true;
  } catch {
    return false;
  }
}

export function trackBookingFallback(runtime: Runtime = window): boolean {
  return track('booking_external_click', undefined, runtime);
}

/** Only the current, fresh-booking callback counts. Reschedules, test bookings
 * and the deprecated legacy callback must not create additional conversions.
 * Cal.com documents that bookingSuccessfulV2 may still need confirmation.
 * https://cal.com/help/embedding/embed-events
 */
export function installBookingTracking(cal: CalNamespace, runtime: Runtime = window): void {
  const sent = new Set<string>();
  const once = (key: string, event: BookingEvent, status?: string) => {
    if (!sent.has(key) && track(event, status, runtime)) sent.add(key);
  };
  cal('on', { action: 'linkReady', callback: () => once('ready', 'booking_ready') });
  cal('on', { action: 'linkFailed', callback: () => once('error', 'booking_error') });
  cal('on', { action: 'eventTypeSelected', callback: () => once('start', 'booking_start') });
  cal('on', { action: 'bookingSuccessfulV2', callback: event => {
    const raw = event?.detail?.data;
    const data = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const status = typeof data.status === 'string' ? data.status.toUpperCase() : '';
    // Retain the UID only in memory for deduplication. No booking details,
    // attendee information, times, URLs or provider identifiers enter GA4.
    const uid = typeof data.uid === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(data.uid) ? data.uid : '';
    if (uid && (status === 'PENDING' || (status === 'ACCEPTED' && data.paymentRequired === true))) {
      once(`${uid}:requested`, 'booking_requested', data.paymentRequired === true ? 'payment_pending' : 'confirmation_pending');
    } else if (uid && status === 'ACCEPTED' && data.paymentRequired === false) {
      once(`${uid}:confirmed`, 'book_call', 'confirmed');
    } else {
      once(`${uid || 'unknown'}:unknown`, 'booking_result_unknown', 'unknown');
    }
  } });
}
