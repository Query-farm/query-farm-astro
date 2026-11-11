# Conversion reporting, booking tracking and inquiry delivery

## Report business outcomes separately

`src/data/conversion-events.json` is the event classification policy. The browser
uses **`newsletter_submit`** for signup requests. Historical
`newsletter_signup` events are an alias for the same request in reports; do not
emit both names and do not label either as a confirmed subscriber.

| Report | Events | What it establishes |
| --- | --- | --- |
| Leads | `generate_lead` | Resend accepted a validated inquiry. Delivery and qualification are separate. |
| Bookings | `book_call` | A fresh Cal.com callback reported an accepted booking with no payment pending. |
| Newsletter requests | `newsletter_submit`, historical `newsletter_signup` | A submitted Buttondown request; confirmation happens off-site. |
| Pending booking requests | `booking_requested` | Organizer confirmation or payment is pending. |
| Engagement | Email/consultation/CTA clicks, SQL trials/runs, tutorial activity, newsletter navigation, scheduler selections | Interest and product use, not leads or bookings. |
| Diagnostics | Inquiry stages/errors, scheduler load/errors, unknown booking callbacks | Journey health; never add `enquiry_accepted` to `generate_lead`. |

Do not use GA4's undifferentiated `keyEvents` total as the number of leads or
bookings. Report each outcome using its explicit event name. Micro-actions
remain useful and continue to be recorded.

### GA4 configuration migration

For property `552129062`, the configuration observed on November 11, 2026 needs
these changes in Admin → Events / Key events:

1. Keep `generate_lead` and `book_call` marked as key events.
2. Stop marking `contact_email_click`, `post_next_step_click`,
   `try_query_run`, and the historical `newsletter_signup` as key events.
   This changes their key-event flags, not collection of the events themselves.
3. Keep `newsletter_submit` as an ordinary event in the newsletter-request
   report. Do not create a rule that also emits `newsletter_signup`.
4. Leave unrelated/default events such as `purchase` alone. Filter the lead and
   booking reports by their event names, regardless of other property settings.
5. Record when the configuration and site code changes go live. Key-event
   changes do not rewrite history, and old `book_call` events did not validate
   confirmation status. Do not compare the old aggregate key-event count with
   the new one as a conversion-rate change.

This is a reviewable migration, not a configuration change performed by the
repository. The VGI Google Analytics worker has read-only access and cannot
apply these flags.

### Reproduce the separated report

Use an existing `ga4` attachment to the local `vgi-google-analytics` worker and
run `scripts/analytics/export-conversions.sql` from a scratch directory. Adjust
the two literal dates to the complete reporting period first. Its exports use
the production hostnames and one `eventName` row for the whole period. Then:

```sh
node --import tsx scripts/analytics/conversion-report.mjs \
  --events /path/to/events.json --key-events /path/to/key-events.json \
  --start 2026-10-22 --end 2026-11-09 --output /path/to/conversion-report.json
```

The JSON separates leads, bookings, newsletter requests, pending booking
requests, engagement and diagnostics. It also proposes key-event flags to
keep, enable or disable and lists unmanaged flags. It only reads local files;
it cannot send events, modify Google configuration or call providers.
Keep raw users and sessions on their source-event rows. Summing those values
across events or aliases double-counts people. The script rejects duplicate
event-name rows so daily exports cannot silently become unique-user totals.

## Validate the newsletter and booking journeys

Newsletter submission preserves native Buttondown navigation, browser email
validation and source metadata. Analytics failures do not block the request.
Only `newsletter_submit` is emitted. Provider-side double opt-in, rejection and
unsubscribe outcomes must be read from Buttondown; the browser cannot infer them.

The scheduler installs its event handlers before requesting the inline embed.
`linkReady`, event selection, embed failure and the direct fallback link have
separate diagnostic or engagement events. `bookingSuccessfulV2` is classified
using the documented `status`, `paymentRequired` and booking UID:

- `ACCEPTED` with `paymentRequired: false` and a UID emits `book_call`.
- `PENDING`, or an accepted booking still requiring payment, emits
  `booking_requested`.
- Incomplete or unexpected results emit `booking_result_unknown`.
- Repeated callbacks for a UID do not duplicate a result. Different UIDs can
  each count, and a pending request may later become confirmed.
- Legacy success, reschedule, cancellation and dry-run callbacks do not create
  new booking conversions. The UID stays in memory for deduplication and is
  never sent to Google, along with attendee details, titles and meeting URLs.

Cal.com's provider records are authoritative for later approval, cancellations,
payment and attendance. The direct scheduler fallback is an outbound journey;
this website cannot observe its eventual outcome. A browser event may be
blocked by consent or an ad blocker. Provider availability is assumed for this
implementation, as requested; no live booking, newsletter submission or email
was sent to validate it.

```sh
npm run test:conversions
npm run test:enquiry
```

The conversion tests cover native newsletter submission and its failure paths,
the scheduling page's actual script and queued Cal.com callbacks, and reporting
classification. Chromium requests are intercepted at context level, including
popup navigations. Existing inquiry tests exercise acceptance, rejection,
retries, signed delivery notifications and database persistence. Together these
check response handling with simulated provider outcomes; they do not assert
that a real message was delivered or a meeting was booked. Both suites run in
deployment CI (their browser portions honor the existing infrastructure-outage
skip input).

## Contact inquiry acceptance and delivery

`POST /api/enquiry` validates the form and Turnstile, then sends to Resend. A
successful provider response must include an email ID before the form counts a
lead. A honeypot acknowledgement has `accepted: false` and never fires
`generate_lead` or `enquiry_accepted`.

The browser records `enquiry_start`, `enquiry_submit`, `enquiry_accepted` and
`enquiry_error`. Only `generate_lead` should be a lead key event; counting both
accepted events as key events would double the conversion count. These events
run only on `query.farm` / `www.query.farm`, honor the availability of the site's
existing `gtag` function, and never send contact details, submitted text, a
Turnstile token or the Resend email ID to Google. An accepted event means Resend
accepted the message, not that it reached the inbox.

The server logs a random `enquiry_id` and the Resend email ID. An optional D1
binding persists that mapping. Resend sends signed status callbacks to
`POST /api/enquiry-delivery`; those callbacks record immutable delivery events.
Only IDs, status names and timestamps enter D1. Recipients, subjects, bodies,
provider error text and IP addresses are not stored there or logged by these
handlers.

## Enable durable monitoring

The code is backward compatible with the existing `RESEND_API_KEY` and
`TURNSTILE_SECRET_KEY`: missing delivery-monitoring configuration does not stop
the contact form from sending. It logs `enquiry_monitoring_gap` instead.
**Durable monitoring is inactive until the binding, migration, webhook and
signing secret below are configured.** These external changes have not been
performed by the implementation tests.

1. Create a D1 database, for example:

   ```sh
   npx wrangler d1 create query-farm-enquiries
   ```

2. Add the real database ID returned by Cloudflare to `wrangler.jsonc`:

   ```jsonc
   "d1_databases": [{
     "binding": "ENQUIRY_DB",
     "database_name": "query-farm-enquiries",
     "database_id": "<actual database UUID>",
     "migrations_dir": "migrations/enquiry"
   }]
   ```

   Use an isolated database and Resend configuration for previews; do not attach
   production delivery history to an untrusted preview. Keep bindings in the
   Wrangler configuration used for deployment so a later deployment retains
   them.

3. Apply the schema before deploying the code with its new binding:

   ```sh
   npx wrangler d1 migrations apply query-farm-enquiries --remote
   ```

4. Create a Resend webhook for
   `https://query.farm/api/enquiry-delivery` with these event subscriptions:
   `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`,
   `email.failed`, `email.suppressed`, `email.complained`.
   Set its signing secret as the encrypted Pages secret
   `RESEND_WEBHOOK_SECRET` on project `query-farm-website`, then deploy.
   This is the webhook's `whsec_...` secret, not the API key. Do not put it in Git.

5. In GA4, add an event-scoped custom dimension named **Enquiry failure reason**
   for event parameter `reason`, so `enquiry_error` can be broken down by reason
   in reports. Its values are the small allowlist in `enquiry-tracking.ts`.
   `form_id` identifies the contact form. Do **not** register `enquiry_id` as a
   custom dimension; it is a high-cardinality diagnostic correlation ID.
   Custom definitions affect reporting going forward, not historical events.

6. Configure the operations log destination/alerting to notify on
   `enquiry_monitoring_gap` and `enquiry_delivery` with status `email.bounced`,
   `email.failed`, `email.suppressed` or `email.complained`; inspect
   `email.delivery_delayed` warnings as well. This implementation emits those
   structured error/warning records; it does not create an external alert rule
   or send alert emails. Provider HTTP status, when available, is preserved in
   `enquiry_rejected` logs for `send_failed`; raw provider bodies are omitted.

## Inspect recent results

This query retains all history and derives the current status by provider event
time, so a late-arriving older callback cannot overwrite a newer outcome:

```sql
SELECT m.enquiry_id, m.resend_id, m.accepted_at,
       COALESCE((SELECT e.event_type FROM enquiry_delivery_events e
                 WHERE e.resend_id = m.resend_id
                 ORDER BY e.occurred_at DESC, e.received_at DESC LIMIT 1),
                'accepted_without_delivery_event') AS latest_status
FROM enquiry_messages m
ORDER BY m.accepted_at DESC;
```

For one enquiry's complete status history:

```sql
SELECT e.event_type, e.occurred_at, e.received_at, e.webhook_id
FROM enquiry_delivery_events e JOIN enquiry_messages m USING (resend_id)
WHERE m.enquiry_id = '<enquiry UUID>'
ORDER BY e.occurred_at, e.received_at;
```

Delivery means the recipient's mail server accepted the email. It does not prove
inbox placement or that someone read it. `accepted_without_delivery_event` can
mean a callback is pending, webhook setup is incomplete, or delivery monitoring
has a problem. Check Resend's own history before deciding which.

The records are diagnostic identifiers that can be joined to private email
history. Limit access to the D1 database. These tables do not expire
automatically; use the site's retention policy to schedule removal when no
longer needed (delete related delivery events before their message records).

## Failure and replay behavior

- Signature verification uses the exact request bytes, HMAC-SHA256 and a
  five-minute past/future timestamp tolerance. A D1 primary key on `svix-id`
  makes repeated authenticated callbacks idempotent. D1 inserts the receipt and
  event in one transaction.
- The webhook returns `503` when storage/secret setup is missing or storage
  fails, allowing Resend to retry. It never acknowledges a failed database write.
- A callback can arrive before the form's send response, or after its receipt
  write failed. Signed tags (`source=website_enquiry` and the enquiry UUID)
  reconstruct the mapping in those cases. Unrelated account email is ignored.
- A monitoring failure after provider acceptance still gives the visitor
  success, avoiding a misleading instruction to resend an accepted message.
  If the provider times out or returns an unreadable response, delivery is
  uncertain; the UI says it could not confirm sending. No automatic resend is
  attempted, since a timed-out request may already have sent mail.
- Failed/expired security checks retain entered values and offer a challenge
  retry. Validation failures leave an unused token intact. A later successful
  challenge never erases a sending-error/email-fallback message.
- These changes do not recover old missing IDs or establish the outcome of
  earlier enquiries. Historical delivery still needs Resend's logs.

## Validate without sending mail or recording production GA events

On Node 22.13 or newer, with the project's dependencies and Playwright Chromium
installed:

```sh
node --import tsx --test tests/enquiry.test.mjs tests/enquiry-webhook.test.mjs tests/enquiry-browser.test.mjs
npm run check:pages-functions
```

Backend tests use stubbed Turnstile/Resend providers. Database tests run the
actual migration and statements in temporary in-memory SQLite databases.
Signature tests include Svix's published independent signature vector, altered
bodies, stale/future timestamps and multiple signatures. They also cover
duplicate/out-of-order events, receipt races, unrelated email, failed writes and
transaction rollback. Browser tests intercept every request, stub the challenge
and capture `gtag` locally; no network request, email or GA event leaves the
test browser.

After configuring production, use the provider's signed webhook test/replay
tools and verify the result in D1. Unrelated sample email is intentionally
ignored; a contact-form test requires a real accepted enquiry or a signed test
payload with the `website_enquiry` tags. Sending a real test enquiry is a
separate operational check and was not performed here.

## Provider references

- [Cal.com embed events](https://cal.com/help/embedding/embed-events)
- [GA4 key-event configuration](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/properties.keyEvents)
- [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Svix signature format and independent test vector](https://docs.svix.com/receiving/verifying-payloads/how-manual)
- [Resend delivery event types](https://resend.com/docs/webhooks/event-types)
- [Cloudflare D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
