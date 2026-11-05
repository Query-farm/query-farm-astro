-- Only correlation IDs and delivery timestamps/statuses. Never message content
-- or contact details. Resend remains the source for the actual email.
CREATE TABLE IF NOT EXISTS enquiry_messages (
  enquiry_id TEXT PRIMARY KEY,
  resend_id TEXT NOT NULL UNIQUE,
  accepted_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enquiry_delivery_events (
  webhook_id TEXT PRIMARY KEY,
  resend_id TEXT NOT NULL REFERENCES enquiry_messages(resend_id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'email.sent', 'email.delivered', 'email.delivery_delayed', 'email.bounced',
    'email.failed', 'email.suppressed', 'email.complained'
  )),
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS enquiry_delivery_by_email
  ON enquiry_delivery_events (resend_id, occurred_at DESC);
