import assert from 'node:assert/strict';
import test from 'node:test';

import { handleEnquiry, validateEnquiry, enquiryEmail } from '../src/lib/enquiry.ts';

const ENV = { RESEND_API_KEY: 're_test', TURNSTILE_SECRET_KEY: 'ts_test' };
const GOOD = {
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  company: 'Analytical Engines',
  topic: 'Consulting',
  message: 'We need a DuckDB extension for our engine.',
  page: '/company/contact',
  turnstileToken: 'token',
  website: '',
};

function post(body) {
  return new Request('https://query.farm/api/enquiry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.7' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

// A stub fetch that records calls and answers Turnstile and Resend.
function stubFetch({ turnstile = true, resendStatus = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('turnstile')) return Response.json({ success: turnstile });
    return new Response('{}', { status: resendStatus });
  };
  return { calls, fetchImpl };
}

test('a valid enquiry is verified, then emailed with the sender as reply-to', async () => {
  const { calls, fetchImpl } = stubFetch();
  const response = await handleEnquiry(post(GOOD), ENV, fetchImpl);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /turnstile\/v0\/siteverify$/);
  assert.equal(calls[0].init.body.get('remoteip'), '203.0.113.7');
  assert.equal(calls[1].url, 'https://api.resend.com/emails');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer re_test');
  const email = JSON.parse(calls[1].init.body);
  assert.deepEqual(email.to, ['hello@query.farm']);
  assert.equal(email.reply_to, 'ada@example.com');
  assert.equal(email.subject, 'Consulting: inquiry from Ada Lovelace (Analytical Engines)');
  assert.match(email.text, /We need a DuckDB extension/);
});

test('invalid fields are reported per field and nothing is sent', async () => {
  const { calls, fetchImpl } = stubFetch();
  const response = await handleEnquiry(post({ ...GOOD, email: 'not-an-address', topic: 'Lunch', message: 'hi' }), ENV, fetchImpl);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.errors).sort(), ['email', 'message', 'topic']);
  assert.equal(calls.length, 0);
});

test('a failed Turnstile check is refused before Resend is called', async () => {
  const { calls, fetchImpl } = stubFetch({ turnstile: false });
  const response = await handleEnquiry(post(GOOD), ENV, fetchImpl);
  assert.equal(response.status, 403);
  assert.equal(calls.length, 1);
});

test('a filled honeypot gets a quiet success and sends nothing', async () => {
  const { calls, fetchImpl } = stubFetch();
  const response = await handleEnquiry(post({ ...GOOD, website: 'http://spam.example' }), ENV, fetchImpl);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 0);
});

test('a Resend failure tells the visitor to email instead', async () => {
  const { fetchImpl } = stubFetch({ resendStatus: 500 });
  const response = await handleEnquiry(post(GOOD), ENV, fetchImpl);
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /hello@query\.farm/);
});

test('missing secrets fail closed with a helpful message', async () => {
  const { calls, fetchImpl } = stubFetch();
  const response = await handleEnquiry(post(GOOD), {}, fetchImpl);
  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test('an unreadable body is a 400', async () => {
  const response = await handleEnquiry(post('{not json'), ENV, stubFetch().fetchImpl);
  assert.equal(response.status, 400);
});

test('validation trims fields and leaves company optional', () => {
  const result = validateEnquiry({ ...GOOD, name: '  Ada  ', company: '' });
  assert.equal(result.ok, true);
  assert.equal(result.enquiry.name, 'Ada');
  const email = enquiryEmail(result.enquiry, 'to@query.farm', 'Site <site@query.farm>');
  assert.equal(email.subject, 'Consulting: inquiry from Ada');
});
