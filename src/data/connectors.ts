// Orchard connectors — the marketplace catalog of VGI workers you can subscribe
// to and ATTACH from DuckDB/Haybarn. This is an early prototype: the shape here
// is intentionally lighter than the introspected DuckDB-extension data model
// (src/data/extensions.ts) and is hand-authored while we iterate on what a
// connector listing should actually surface.

export type ConnectorStatus = 'stable' | 'beta' | 'preview';
export type ConnectorPricing = 'free' | 'subscription' | 'enterprise';

export interface ConnectorOffering {
  /** What the worker exposes to SQL once attached. */
  kind: 'table' | 'function' | 'macro' | 'secret';
  name: string;
  description: string;
}

export interface Connector {
  id: string;
  name: string;
  tagline: string;
  /** Marketplace category, e.g. "Streaming", "Email", "Governance". */
  category: string;
  /** Emoji used as the connector mark while we prototype. */
  icon: string;
  status: ConnectorStatus;
  pricing: ConnectorPricing;
  /** Short human price label shown on cards, e.g. "From $49/mo" or "Free". */
  priceNote: string;
  popular?: boolean;
  /** Curated marketplace highlight — shown in the Featured row (Kafka leads). */
  featured?: boolean;
  /** Rough monthly attach count, used to order the "Most used" nav list. */
  uses?: number;
  provider: string;
  /** One- or two-sentence summary for cards and meta descriptions. */
  summary: string;
  /** Longer prose for the detail page, one entry per paragraph. */
  description: string[];
  features: string[];
  /** Tables / functions / secrets the worker exposes once attached. */
  offers: ConnectorOffering[];
  useCases: string[];
  /** ATTACH + query snippet shown on the detail page. */
  exampleSql: string;
  /** Worker implementation language, surfaced as a small detail. */
  language: string;
  /** Tailwind classes for the accent chip / icon tile. */
  theme: { iconBg: string; iconText: string; accent: string };
}

export const connectors: Connector[] = [
  {
    id: 'kafka',
    name: 'Kafka',
    tagline: 'Read and produce Kafka topics as SQL tables.',
    category: 'Streaming',
    icon: '🪣',
    status: 'stable',
    pricing: 'subscription',
    priceNote: 'From $49/mo',
    popular: true,
    featured: true,
    uses: 6900,
    provider: 'Query.Farm',
    language: 'Rust',
    summary:
      'Attach a Kafka cluster and consume topics as DuckDB tables — no Connect cluster, no Flink job, no bespoke consumer to babysit.',
    description: [
      'The Kafka connector turns any Kafka-compatible cluster (Apache Kafka, Redpanda, MSK, Confluent Cloud) into an attachable SQL catalog. Topics show up as tables you can SELECT from, filter, and join against the rest of your data.',
      'Consume from an offset or tail the live tail of a topic, decode JSON or Avro payloads into typed columns, and write rows back to a topic with a table function. The worker manages consumer groups, schema-registry lookups, and backpressure so your SQL stays simple.',
    ],
    features: [
      'Consume topics as tables with JSON or Avro decoding',
      'Tail live messages or replay from a specific offset',
      'Schema Registry integration for typed columns',
      'Produce rows back to a topic from SQL',
      'Works with Apache Kafka, Redpanda, MSK, and Confluent Cloud',
    ],
    offers: [
      { kind: 'table', name: 'kafka.topics', description: 'One row per topic with partition and offset metadata.' },
      { kind: 'table', name: 'kafka.consumer_groups', description: 'Lag and assignment per consumer group.' },
      { kind: 'function', name: 'read_topic(topic, from)', description: 'Stream a topic as rows, decoded to typed columns.' },
      { kind: 'function', name: 'produce(topic, rows)', description: 'Write a result set back to a Kafka topic.' },
      { kind: 'secret', name: 'kafka_credentials', description: 'SASL / TLS credentials stored as a DuckDB secret.' },
    ],
    useCases: [
      'Ad-hoc debugging of what is actually flowing through a topic.',
      'Join a live event stream against reference tables in your warehouse.',
      'Backfill a table from a topic replay without standing up a pipeline.',
    ],
    exampleSql: `-- Attach the Kafka worker from the Orchard
ATTACH 'kafka' AS kafka (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/kafka',
  TOKEN getenv('ORCHARD_TOKEN')
);

-- Tail the last 10 minutes of an orders topic
SELECT key, value:customer_id AS customer_id, value:total AS total, ts
FROM read_topic('orders', from => 'latest')
WHERE ts > now() - INTERVAL 10 MINUTE
ORDER BY ts DESC;`,
    theme: { iconBg: 'bg-cat-gold', iconText: 'text-cat-gold-ink', accent: 'gold' },
  },
  {
    id: 'imap',
    name: 'IMAP',
    tagline: 'Query mailboxes and messages over IMAP as tables.',
    category: 'Email',
    icon: '📬',
    status: 'stable',
    pricing: 'subscription',
    priceNote: 'From $29/mo',
    popular: true,
    featured: true,
    uses: 5100,
    provider: 'Query.Farm',
    language: 'Python',
    summary:
      'Point the connector at any IMAP server and read folders, message headers, and bodies as SQL tables — perfect for support inboxes, receipts, and alerts.',
    description: [
      'The IMAP connector exposes an email account as a queryable catalog. Folders become a table, messages become rows, and headers, flags, and parsed bodies become columns you can filter and aggregate.',
      'It handles the awkward parts of IMAP for you: MIME decoding, attachment metadata, threading, and incremental sync by UID so repeated queries stay fast. Combine it with other connectors to, say, reconcile receipts in an inbox against transactions in your warehouse.',
    ],
    features: [
      'Folders, messages, and flags as SQL tables',
      'MIME-decoded subject, body, and attachment metadata',
      'Full-text search pushed down to the IMAP server',
      'Incremental sync by UID for fast repeat queries',
      'Read-only by default; OAuth or app-password auth',
    ],
    offers: [
      { kind: 'table', name: 'imap.mailboxes', description: 'One row per folder with message counts.' },
      { kind: 'table', name: 'imap.messages', description: 'Headers, flags, and decoded bodies per message.' },
      { kind: 'function', name: 'search(query)', description: 'Server-side IMAP search returning matching messages.' },
      { kind: 'secret', name: 'imap_credentials', description: 'Host, username, and OAuth/app-password secret.' },
    ],
    useCases: [
      'Triage a shared support inbox with SQL instead of filters.',
      'Extract receipts or invoices and join them to accounting data.',
      'Audit which alerting emails actually arrived, and when.',
    ],
    exampleSql: `-- Attach an IMAP mailbox from the Orchard
ATTACH 'imap' AS mail (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/imap',
  TOKEN getenv('ORCHARD_TOKEN')
);

-- Unanswered support email in the last week, by sender
SELECT from_address, count(*) AS messages
FROM mail.messages
WHERE mailbox = 'Support'
  AND NOT answered
  AND received > now() - INTERVAL 7 DAY
GROUP BY from_address
ORDER BY messages DESC;`,
    theme: { iconBg: 'bg-cat-slate', iconText: 'text-cat-slate-ink', accent: 'slate' },
  },
  {
    id: 'row-column-security',
    name: 'Row / Column Level Security',
    tagline: 'Policy-based row filtering and column masking for any catalog.',
    category: 'Governance',
    icon: '🛡️',
    status: 'beta',
    pricing: 'enterprise',
    priceNote: 'Contact us',
    popular: true,
    uses: 2600,
    provider: 'Query.Farm',
    language: 'Go',
    summary:
      'Sit a governance worker in front of your data so every query is filtered to the rows a user may see and masked on the columns they may not.',
    description: [
      'Row / Column Level Security is a policy worker that wraps another attached catalog. Define policies once — by role, attribute, or tenant — and the worker rewrites incoming queries so users only ever see permitted rows and masked or omitted sensitive columns.',
      'Policies are evaluated at query time against the caller’s identity, so the same table can return different results to different people without copying data into per-team views. Decisions are logged for audit, and policies live in version-controllable rules rather than scattered grants.',
    ],
    features: [
      'Row filters by role, attribute, or tenant',
      'Column masking, hashing, or full redaction',
      'Policy-as-code with review and versioning',
      'Per-query audit log of access decisions',
      'Wraps any VGI catalog or DuckDB attachment',
    ],
    offers: [
      { kind: 'table', name: 'rcls.policies', description: 'The active policy set with their targets.' },
      { kind: 'table', name: 'rcls.audit', description: 'Every access decision, with caller and outcome.' },
      { kind: 'function', name: 'explain_access(table)', description: 'Show why a caller can or cannot see rows.' },
      { kind: 'secret', name: 'rcls_identity', description: 'Identity provider binding for the caller context.' },
    ],
    useCases: [
      'Give every team one shared table without per-team copies.',
      'Mask PII columns for analysts while keeping them for auditors.',
      'Enforce tenant isolation in a multi-tenant dataset.',
    ],
    exampleSql: `-- Attach a protected catalog through the RCLS worker
ATTACH 'sales' AS sales (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/rcls',
  TOKEN getenv('ORCHARD_TOKEN'),
  PROTECT 'warehouse.public'      -- the catalog policies apply to
);

-- The same query returns only rows this caller may see,
-- with restricted columns masked automatically.
SELECT region, customer_name, email, revenue
FROM sales.customers
ORDER BY revenue DESC;`,
    theme: { iconBg: 'bg-cat-clay', iconText: 'text-cat-clay-ink', accent: 'clay' },
  },
  {
    id: 'hostquery',
    name: 'HostQuery',
    tagline: 'Federate queries across remote database hosts.',
    category: 'Federation',
    icon: '🛰️',
    status: 'beta',
    pricing: 'subscription',
    priceNote: 'From $99/mo',
    popular: true,
    featured: true,
    uses: 4300,
    provider: 'Query.Farm',
    language: 'Rust',
    summary:
      'Register remote Postgres, MySQL, and other hosts once, then query them — and join across them — from a single DuckDB session.',
    description: [
      'HostQuery is a federation worker. Register a set of remote database hosts with the worker and each becomes an attachable schema. DuckDB can then read from them, push down filters and projections, and join results across hosts that could never talk to each other directly.',
      'The worker handles connection pooling, credential storage, and dialect translation, so a single SQL query can span a production Postgres replica, an analytics MySQL box, and a local Parquet file at once — without an ETL hop in between.',
    ],
    features: [
      'Register many remote hosts as one catalog',
      'Predicate and projection push-down per host',
      'Cross-host joins from a single session',
      'Connection pooling and credential isolation',
      'Postgres, MySQL, and ODBC-speaking hosts',
    ],
    offers: [
      { kind: 'table', name: 'hostquery.hosts', description: 'Registered hosts and their reachability.' },
      { kind: 'function', name: 'remote(host, sql)', description: 'Run a statement on a specific host and stream rows.' },
      { kind: 'macro', name: 'h(host, table)', description: 'Shorthand to reference a remote host’s table.' },
      { kind: 'secret', name: 'host_credentials', description: 'Per-host connection secrets.' },
    ],
    useCases: [
      'Join a production replica with an analytics database live.',
      'Query many regional shards as if they were one table.',
      'Pull a reference table from another team without exporting it.',
    ],
    exampleSql: `-- Attach the HostQuery federation worker
ATTACH 'hosts' AS hq (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/hostquery',
  TOKEN getenv('ORCHARD_TOKEN')
);

-- Join a Postgres replica against an analytics MySQL host
SELECT o.id, o.total, c.segment
FROM hq.pg_prod.orders     AS o
JOIN hq.mysql_analytics.customers AS c USING (customer_id)
WHERE o.created_at > now() - INTERVAL 1 DAY;`,
    theme: { iconBg: 'bg-cat-plum', iconText: 'text-cat-plum-ink', accent: 'plum' },
  },
  {
    id: 'citibike',
    name: 'Citi Bike',
    tagline: 'Live NYC Citi Bike trips, stations, and status as SQL.',
    category: 'Public data',
    icon: '🚲',
    status: 'stable',
    pricing: 'free',
    priceNote: 'Free',
    popular: true,
    uses: 3800,
    provider: 'Query.Farm',
    language: 'Python',
    summary:
      'A free, ready-to-attach connector serving NYC Citi Bike’s public station, status, and trip-history feeds as tidy SQL tables — great for demos and learning.',
    description: [
      'The Citi Bike connector wraps the public Citi Bike GBFS and trip-history feeds into a clean SQL catalog. Live station status, station metadata, and historical trips are all queryable without downloading and unzipping CSVs yourself.',
      'It is free to attach and is the connector behind several of the Query.Farm homepage examples. Use it to learn the Orchard workflow, prototype geospatial joins, or build a quick dashboard against real, constantly-changing data.',
    ],
    features: [
      'Live station status and capacity',
      'Station metadata with coordinates',
      'Historical trips by month',
      'Geospatial-ready latitude/longitude columns',
      'Free to attach — no subscription required',
    ],
    offers: [
      { kind: 'table', name: 'citibike.stations', description: 'Station id, name, capacity, and coordinates.' },
      { kind: 'table', name: 'citibike.status', description: 'Live bikes and docks available per station.' },
      { kind: 'table', name: 'citibike.trips', description: 'Historical trip records by month.' },
    ],
    useCases: [
      'Learn the Orchard attach-and-query workflow for free.',
      'Prototype geospatial joins against weather or census data.',
      'Build a live “where are the bikes” dashboard.',
    ],
    exampleSql: `-- Attach the free Citi Bike connector (no token required)
ATTACH 'citibike' AS citibike (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/citibike'
);

-- Busiest stations that are nearly empty right now
SELECT s.name, st.num_bikes_available, st.num_docks_available
FROM citibike.status   AS st
JOIN citibike.stations AS s USING (station_id)
WHERE st.num_bikes_available <= 2
ORDER BY s.capacity DESC
LIMIT 10;`,
    theme: { iconBg: 'bg-cat-moss', iconText: 'text-cat-moss-ink', accent: 'moss' },
  },
  {
    id: 'volcanos',
    name: 'Volcanos',
    tagline: 'The Smithsonian global volcano catalog as SQL tables.',
    category: 'Public data',
    icon: '🌋',
    status: 'stable',
    pricing: 'free',
    priceNote: 'Free',
    popular: true,
    uses: 8200,
    provider: 'Query.Farm',
    language: 'Python',
    summary:
      'A free, ready-to-attach connector serving the Smithsonian Global Volcanism Program catalog — volcanoes, eruptions, and types — as clean SQL tables.',
    description: [
      'The Volcanos connector wraps the Smithsonian Global Volcanism Program data into an attachable SQL catalog. Query volcanoes by region, type, and last-known eruption without scraping or downloading anything yourself.',
      'It is the reference worker behind several Query.Farm VGI examples and is free to attach. Use it to learn the Orchard workflow or to practice geospatial joins against other public datasets.',
    ],
    features: [
      'Smithsonian volcano catalog as tables',
      'Eruption history and volcano types',
      'Latitude / longitude ready for geospatial joins',
      'No token required — free to attach',
      'Backs the Query.Farm VGI demos',
    ],
    offers: [
      { kind: 'table', name: 'smithsonian.volcanoes', description: 'One row per volcano with region and type.' },
      { kind: 'table', name: 'smithsonian.eruptions', description: 'Recorded eruptions with dates and VEI.' },
      { kind: 'table', name: 'smithsonian.pleistocene_volcanoes', description: 'Pleistocene-era volcanoes subset.' },
    ],
    useCases: [
      'Learn the Orchard attach-and-query workflow for free.',
      'Join volcano locations against weather or air-quality data.',
      'Teach geospatial SQL with a real, tidy dataset.',
    ],
    exampleSql: `-- Attach the free Volcanos connector (no token required)
ATTACH 'volcanos' AS volcanos (
  TYPE vgi,
  LOCATION 'https://vgi-volcanos.fly.dev/'
);

-- The ten most recently active volcanoes by country
SELECT name, country, primary_type, last_eruption_year
FROM volcanos.smithsonian.volcanoes
WHERE last_eruption_year IS NOT NULL
ORDER BY last_eruption_year DESC
LIMIT 10;`,
    theme: { iconBg: 'bg-cat-field', iconText: 'text-cat-field-ink', accent: 'field' },
  },
  {
    id: 'earthquakes',
    name: 'Earthquakes',
    tagline: 'Live USGS earthquake feeds as SQL tables.',
    category: 'Public data',
    icon: '🌎',
    status: 'stable',
    pricing: 'free',
    priceNote: 'Free',
    popular: true,
    uses: 7400,
    provider: 'Query.Farm',
    language: 'Python',
    summary:
      'A free connector serving the USGS real-time earthquake feeds — magnitude, depth, and location — as SQL tables you can filter and join.',
    description: [
      'The Earthquakes connector exposes the USGS earthquake GeoJSON feeds as a queryable catalog. Recent events become rows with magnitude, depth, place, and coordinates, refreshed on the USGS cadence.',
      'It is free to attach and pairs naturally with the Volcanos connector and other geospatial public data. Great for live dashboards, alerting prototypes, and learning the Orchard workflow.',
    ],
    features: [
      'USGS real-time feeds (hour / day / week)',
      'Magnitude, depth, and place columns',
      'Latitude / longitude for geospatial joins',
      'Refreshed on the USGS cadence',
      'No token required — free to attach',
    ],
    offers: [
      { kind: 'table', name: 'usgs.events', description: 'Recent earthquake events with magnitude and location.' },
      { kind: 'function', name: 'feed(window)', description: 'Pull a specific USGS feed window (hour, day, week).' },
    ],
    useCases: [
      'Build a live “recent quakes” dashboard for free.',
      'Join quakes against volcanoes or population data.',
      'Prototype magnitude-threshold alerting with SQL.',
    ],
    exampleSql: `-- Attach the free Earthquakes connector (no token required)
ATTACH 'earthquakes' AS quakes (
  TYPE vgi,
  LOCATION 'https://orchard.query.farm/earthquakes'
);

-- Significant quakes in the last day, strongest first
SELECT place, mag, depth_km, time
FROM quakes.usgs.events
WHERE mag >= 4.5
  AND time > now() - INTERVAL 1 DAY
ORDER BY mag DESC;`,
    theme: { iconBg: 'bg-cat-gold', iconText: 'text-cat-gold-ink', accent: 'gold' },
  },
];

export const popularConnectors = connectors.filter((c) => c.popular);

/** Curated Featured row — Kafka leads, then by attach count. Scales to any count. */
export const featuredConnectors = connectors
  .filter((c) => c.featured)
  .sort((a, b) => Number(b.id === 'kafka') - Number(a.id === 'kafka') || (b.uses ?? 0) - (a.uses ?? 0));

/** Connectors ordered by attach count — used for the "Most used" nav list. */
export const topConnectors = [...connectors].sort((a, b) => (b.uses ?? -1) - (a.uses ?? -1));

export const getConnector = (id: string): Connector | undefined =>
  connectors.find((c) => c.id === id);

export const pricingLabel: Record<ConnectorPricing, string> = {
  free: 'Free',
  subscription: 'Subscription',
  enterprise: 'Enterprise',
};

export const statusLabel: Record<ConnectorStatus, string> = {
  stable: 'Stable',
  beta: 'Beta',
  preview: 'Preview',
};
