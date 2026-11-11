import assert from 'node:assert/strict';
import test from 'node:test';
import { conversionReport } from '../src/lib/conversion-reporting.ts';

test('historical signup requests and micro-actions cannot inflate lead or booking reporting', () => {
  const report = conversionReport([
    { eventName: 'generate_lead', eventCount: 2, totalUsers: 2 },
    { eventName: 'enquiry_accepted', eventCount: 2, totalUsers: 2 },
    { eventName: 'book_call', eventCount: 1, totalUsers: 1 },
    { eventName: 'booking_requested', eventCount: 3, totalUsers: 3 },
    { eventName: 'try_query_run', eventCount: 12, totalUsers: 3 },
    { eventName: 'tutorial_read_progress', eventCount: 2, totalUsers: 1 },
    { eventName: 'newsletter_signup', eventCount: 1, totalUsers: 1 },
    { eventName: 'newsletter_submit', eventCount: 1, totalUsers: 1 },
  ], ['generate_lead', 'book_call', 'try_query_run', 'newsletter_signup', 'purchase'].map(event_name => ({ event_name })));
  const counts = Object.fromEntries(report.groups.map(g => [g.group, g.event_count]));
  assert.deepEqual(counts, { leads: 2, bookings: 1, newsletter_requests: 2, booking_requests: 3, engagement: 14, diagnostics: 2, other: 0 });
  assert.equal(report.events.find(e => e.source_event === 'newsletter_signup').canonical_event, 'newsletter_submit');
  assert.ok(report.groups.every(g => !('users' in g)));
  assert.deepEqual(report.ga4_key_event_plan, {
    mode: 'review_only', keep: ['generate_lead', 'book_call'], enable: [],
    disable: ['try_query_run', 'newsletter_signup'], unmanaged: ['purchase'],
  });
});

test('daily exports and malformed counts are refused instead of silently double-counting users', () => {
  const event = { eventName: 'generate_lead', eventCount: 1, totalUsers: 1 };
  assert.throws(() => conversionReport([event, event], []), /whole period/);
  for (const eventCount of [-1, 0.5, NaN, '2']) assert.throws(() => conversionReport([{ ...event, eventCount }], []));
  assert.deepEqual(conversionReport([], []).ga4_key_event_plan.enable, ['generate_lead', 'book_call']);
});
