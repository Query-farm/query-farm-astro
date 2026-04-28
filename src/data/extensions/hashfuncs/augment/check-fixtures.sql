-- Fixtures for the hashfuncs cookbook / technical-details examples.
--
-- The hashfuncs extension itself is pure CPU (no catalog, no network),
-- so these fixtures only exist to satisfy the *table references* the
-- documentation makes ("FROM events", "FROM users", ...). The numbers
-- chosen are tiny and deterministic so re-running the suite is stable.
--
-- Idempotent: every CREATE uses OR REPLACE.

-- The bitfilters cookbook section pairs hashfuncs with the bitfilters
-- extension. Load it best-effort so xor8_filter / xor8_filter_contains
-- resolve at parse time. If the community binary isn't available on the
-- current platform we still want the rest of the fixtures to apply.
INSTALL bitfilters FROM community;
LOAD bitfilters;

-- cookbook.mdx — "Hash partitioning" and "Independent hashes via seeds"
CREATE OR REPLACE TABLE users AS
SELECT i AS user_id
FROM range(0, 8) t(i);

-- cookbook.mdx — "Cross-system routing (Cassandra / Spark)"
CREATE OR REPLACE TABLE rows_to_route AS
SELECT 'k' || i::VARCHAR AS key
FROM range(0, 4) t(i);

-- cookbook.mdx — "String cache keys"
CREATE OR REPLACE TABLE query_log AS
SELECT i AS user_id,
       'select ' || i::VARCHAR AS query_text
FROM range(0, 4) t(i);

-- cookbook.mdx — "Bloom / XOR / Cuckoo filter input"
CREATE OR REPLACE TABLE allowed_users AS
SELECT 'user' || i::VARCHAR || '@example.com' AS email
FROM range(0, 4) t(i);

-- cookbook.mdx — second bitfilters block reads from `filter_table f`
-- (a one-row table holding a pre-built xor8 filter).
CREATE OR REPLACE TABLE filter_table AS
SELECT xor8_filter(xxh3_64(email)) AS filter
FROM allowed_users;

-- cookbook.mdx — "Independent hashes via seeds" uses `FROM keys`
CREATE OR REPLACE TABLE keys AS
SELECT 'k' || i::VARCHAR AS key
FROM range(0, 4) t(i);

-- cookbook.mdx + technical-details.mdx — "events" with event_id, payload
-- Used by sharding / dedup / "magic moment" examples.
CREATE OR REPLACE TABLE events AS
SELECT i AS event_id,
       'evt-' || i::VARCHAR AS payload,
       'user' || i::VARCHAR || '@example.com' AS email
FROM range(0, 8) t(i);

-- technical-details.mdx — "double-hash with two seeds" reads `FROM data`
CREATE OR REPLACE TABLE data AS
SELECT 'k' || i::VARCHAR AS key
FROM range(0, 4) t(i);
