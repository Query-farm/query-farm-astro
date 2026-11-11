import assert from 'node:assert/strict';
import test from 'node:test';
import { installBookingTracking, trackBookingFallback } from '../src/lib/booking-analytics.ts';

function setup(hostname = 'query.farm') {
  const callbacks = {}, events = [];
  const runtime = { location: { hostname }, gtag: (...args) => events.push(args) };
  installBookingTracking((command, { action, callback }) => { assert.equal(command, 'on'); callbacks[action] = callback; }, runtime);
  return { callbacks, events, runtime, emit: data => callbacks.bookingSuccessfulV2({ detail: { data } }) };
}

test('fresh confirmed bookings count once per UID; callback details remain private', () => {
  const s = setup();
  const booking = { uid: 'secret-booking-1', status: 'ACCEPTED', paymentRequired: false,
    title: 'Private title', email: 'private@example.com', videoCallUrl: 'https://private.example' };
  s.emit(booking); s.emit(booking);
  s.emit({ ...booking, uid: 'secret-booking-2', status: 'accepted' });
  assert.deepEqual(s.events, Array.from({ length: 2 }, () => ['event', 'book_call', {
    method: 'cal.com', transport_type: 'beacon', booking_status: 'confirmed',
  }]));
  assert.doesNotMatch(JSON.stringify(s.events), /secret|Private|private/);
  for (const excluded of ['bookingSuccessful', 'dryRunBookingSuccessfulV2', 'rescheduleBookingSuccessfulV2', 'bookingCancelled']) {
    assert.equal(s.callbacks[excluded], undefined);
  }
});

test('pending confirmation and payment are requests; an eventual confirmation counts separately', () => {
  const s = setup();
  s.emit({ uid: 'one', status: 'PENDING', paymentRequired: false });
  s.emit({ uid: 'one', status: 'PENDING', paymentRequired: false });
  s.emit({ uid: 'two', status: 'ACCEPTED', paymentRequired: true });
  s.emit({ uid: 'one', status: 'ACCEPTED', paymentRequired: false });
  assert.deepEqual(s.events.map(e => [e[1], e[2].booking_status]), [
    ['booking_requested', 'confirmation_pending'], ['booking_requested', 'payment_pending'], ['book_call', 'confirmed'],
  ]);
});

test('incomplete, cancelled, rejected and malformed callbacks never count a booking', () => {
  const s = setup();
  for (const data of [null, [], {}, { uid: 'a', status: 'ACCEPTED' }, { status: 'ACCEPTED', paymentRequired: false },
    { uid: 'b', status: 'CANCELLED', paymentRequired: false }, { uid: 'c', status: 'REJECTED', paymentRequired: false }]) s.emit(data);
  assert.ok(s.events.every(e => e[1] === 'booking_result_unknown'));
});

test('loading, selecting and using the fallback are distinct from completed bookings', () => {
  const s = setup();
  s.callbacks.linkReady(); s.callbacks.linkReady();
  s.callbacks.eventTypeSelected(); s.callbacks.linkFailed({ detail: { data: { msg: 'private@example.com' } } });
  trackBookingFallback(s.runtime);
  assert.deepEqual(s.events.map(e => e[1]), ['booking_ready', 'booking_start', 'booking_error', 'booking_external_click']);
  assert.doesNotMatch(JSON.stringify(s.events), /private@example/);
});

test('preview hosts, missing analytics and throwing analytics do not break booking', () => {
  for (const host of ['localhost', 'preview.pages.dev']) {
    const s = setup(host); s.emit({ uid: 'one', status: 'ACCEPTED', paymentRequired: false });
    assert.equal(s.events.length, 0); assert.equal(trackBookingFallback(s.runtime), false);
  }
  const s = setup();
  s.runtime.gtag = () => { throw new Error('Blocked'); };
  assert.doesNotThrow(() => s.emit({ uid: 'one', status: 'ACCEPTED', paymentRequired: false }));
  delete s.runtime.gtag;
  assert.equal(trackBookingFallback(s.runtime), false);
  s.runtime.gtag = (...args) => s.events.push(args);
  s.emit({ uid: 'one', status: 'ACCEPTED', paymentRequired: false });
  assert.equal(s.events.length, 1);
});
