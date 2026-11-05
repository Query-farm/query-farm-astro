# Contact enquiry tracking and email delivery

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

- [Resend webhook verification](https://resend.com/docs/webhooks/verify-webhooks-requests)
- [Svix signature format and independent test vector](https://docs.svix.com/receiving/verifying-payloads/how-manual)
- [Resend delivery event types](https://resend.com/docs/webhooks/event-types)
- [Cloudflare D1 transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/)
