-- Hosted Orchard: organisations, members, deployments and the manual
-- request tracker. Fly provisioning is done by hand; `deployment_events`
-- records each actual instance count, and is the only source for metering.
-- Apply with:
--   npx wrangler d1 migrations apply orchard --remote   (binding ORCHARD_DB)

-- One row per WorkOS Organization (the customer's company).
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY,                       -- WorkOS organization id (org_…)
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,                  -- WorkOS user id
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  billing_status TEXT NOT NULL DEFAULT 'none',  -- none, or the Stripe subscription status
  payment_status TEXT CHECK (payment_status IN ('paid', 'failed')),
  license_item_id TEXT,                      -- subscription item for the paid-worker license price
  billing_event_at INTEGER                   -- Stripe event.created of the last applied billing change
);

CREATE TABLE IF NOT EXISTS members (
  org_id TEXT NOT NULL REFERENCES orgs(id),
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL,
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS members_by_user ON members (user_id);

CREATE TABLE IF NOT EXISTS deployments (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES orgs(id),
  worker TEXT NOT NULL,                      -- Orchard slug
  worker_name TEXT NOT NULL,
  catalog TEXT NOT NULL,                     -- default ATTACH alias
  version TEXT,                              -- release tag at request time
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  size TEXT NOT NULL CHECK (size IN ('s', 'm', 'l')),
  region TEXT NOT NULL,
  desired_instances INTEGER NOT NULL CHECK (desired_instances >= 0),
  actual_instances INTEGER NOT NULL DEFAULT 0 CHECK (actual_instances >= 0),
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'provisioning', 'live', 'stopped', 'rejected')),
  endpoint TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deployments_by_org ON deployments (org_id, created_at DESC);

-- Each change to the number of running instances, written when Rusty marks a
-- request done. Instance-hours are integrated from these rows.
CREATE TABLE IF NOT EXISTS deployment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL REFERENCES deployments(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  size TEXT NOT NULL CHECK (size IN ('s', 'm', 'l')),
  instances INTEGER NOT NULL CHECK (instances >= 0),
  occurred_at TEXT NOT NULL,
  request_id TEXT,
  actor TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS deployment_events_by_time ON deployment_events (occurred_at);
CREATE INDEX IF NOT EXISTS deployment_events_by_deployment ON deployment_events (deployment_id, occurred_at);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  deployment_id TEXT NOT NULL REFERENCES deployments(id),
  org_id TEXT NOT NULL REFERENCES orgs(id),
  kind TEXT NOT NULL CHECK (kind IN ('create', 'scale', 'stop')),
  desired_instances INTEGER NOT NULL CHECK (desired_instances >= 0),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done', 'rejected')),
  note TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS requests_open ON requests (status, created_at);
CREATE INDEX IF NOT EXISTS requests_by_deployment ON requests (deployment_id, created_at DESC);

-- One row per person the first time they sign in.
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  org_id TEXT,
  source_page TEXT,
  worker TEXT,
  created_at TEXT NOT NULL,
  resend_id TEXT
);

-- Stripe webhook event ids already applied (Stripe retries; this dedupes).
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at TEXT NOT NULL
);

-- One row per (org, size, UTC day) usage report sent to Stripe.
CREATE TABLE IF NOT EXISTS meter_reports (
  identifier TEXT PRIMARY KEY,               -- also the Stripe meter event identifier
  org_id TEXT NOT NULL,
  size TEXT NOT NULL,
  day TEXT NOT NULL,                         -- YYYY-MM-DD (UTC)
  minutes INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'skipped', 'failed')),
  detail TEXT,
  updated_at TEXT NOT NULL
);
