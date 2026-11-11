import definitions from '../data/conversion-events.json';

interface Definition { group: string; key_event: boolean; canonical?: string; meaning: string }
const policy: Record<string, Definition> = Object.assign(Object.create(null), definitions);
interface EventRow { eventName: string; eventCount: number; totalUsers?: number; sessions?: number }

/** Input is one GA4 eventName row for the entire reporting period, not daily
 * rows. Users stay on those rows: summing users across aliases or events would
 * double-count people. Historical newsletter events are requests, not opt-ins.
 */
export function conversionReport(rows: EventRow[], keyEvents: { event_name: string }[]) {
  const seen = new Set<string>();
  const events = rows.map(row => {
    if (!row || typeof row.eventName !== 'string' || seen.has(row.eventName)
      || !Number.isSafeInteger(row.eventCount) || row.eventCount < 0
      || (row.totalUsers !== undefined && (!Number.isSafeInteger(row.totalUsers) || row.totalUsers < 0))
      || (row.sessions !== undefined && (!Number.isSafeInteger(row.sessions) || row.sessions < 0))) {
      throw new Error('Expected one valid GA4 eventName row per event for the whole period. Do not supply daily rows.');
    }
    seen.add(row.eventName);
    const rule = policy[row.eventName];
    return {
      source_event: row.eventName,
      canonical_event: rule?.canonical ?? row.eventName,
      group: rule?.group ?? 'other',
      event_count: row.eventCount,
      users_for_source_event: row.totalUsers ?? null,
      sessions_for_source_event: row.sessions ?? null,
      meaning: rule?.meaning ?? 'Outside the conversion policy; review separately.',
    };
  });
  const groups = ['leads', 'bookings', 'newsletter_requests', 'booking_requests', 'engagement', 'diagnostics', 'other']
    .map(group => ({ group, event_count: events.filter(e => e.group === group).reduce((sum, e) => sum + e.event_count, 0) }));
  const current = new Set(keyEvents.map(row => row.event_name));
  const wanted = Object.keys(policy).filter(name => policy[name].key_event);
  return {
    groups, events,
    notes: [
      'Each group counts events, not distinct people. Leads and bookings must remain separate.',
      'Both newsletter names represent submitted requests. Confirmed subscriptions require Buttondown evidence.',
      'generate_lead records provider acceptance, not inbox delivery or lead qualification.',
      'book_call is a browser observation. Provider records determine current booking status, cancellation and attendance.',
      'Historical book_call callbacks did not check confirmation status; the stricter definition starts when the new site code is deployed.',
      'GA4 key-event configuration changes apply going forward and do not repair historical conversion totals.',
    ],
    ga4_key_event_plan: {
      mode: 'review_only',
      keep: wanted.filter(name => current.has(name)),
      enable: wanted.filter(name => !current.has(name)),
      disable: [...current].filter(name => policy[name] && !policy[name].key_event),
      unmanaged: [...current].filter(name => !policy[name]),
    },
  };
}
