-- Fixtures for the datasketches extension cookbook / technical-details /
-- functions.json examples. Provides the source tables that the snippets
-- reference (events, requests, page_views, measurements, …) so they can
-- actually execute under the validator instead of skipping with
-- "table fixture missing".
--
-- The validator's parse phase EXPLAINs each statement in a snippet
-- individually, so a snippet of the shape `CREATE TABLE foo …; SELECT
-- … FROM foo;` will fail to parse the SELECT (foo doesn't exist yet
-- during EXPLAIN). For the affected tables (daily_uniques, readings)
-- we pre-create them with the same column names + types the snippets
-- expect, so EXPLAIN succeeds. The subsequent execute phase will hit
-- "table already exists" on the in-snippet CREATE — that's an
-- accepted EXEC-FAIL on a couple of CREATE-flavored snippets, in
-- exchange for many more PASSes on SELECT-flavored ones.

----------------------------------------------------------------------
-- events: the catch-all source table referenced by HLL/CPC/Theta
-- examples. Carries enough columns to satisfy every reference:
--   user_id        → distinct-count examples
--   ts             → date_trunc('day', ts) for per-day rollups
--   country_code   → frequent-items examples
--   cohort         → datasketch_theta GROUP BY cohort example
----------------------------------------------------------------------
CREATE OR REPLACE TABLE events AS
SELECT
    (i % 30)                               AS user_id,
    TIMESTAMP '2026-01-01 00:00:00'
        + INTERVAL (i) HOUR                AS ts,
    (['US','GB','DE','FR','NO','SE','JP','CA','BR','AU'])[1 + (i % 10)]
                                           AS country_code,
    (['signup','active','dormant'])[1 + (i % 3)]
                                           AS cohort
FROM range(0, 200) t(i);

----------------------------------------------------------------------
-- events_jan / events_feb: the Theta set-algebra (funnel/retention/
-- churn) example partitions users across two months. Overlapping but
-- not identical user-id ranges make the intersect / a-not-b results
-- non-trivial.
----------------------------------------------------------------------
CREATE OR REPLACE TABLE events_jan AS
SELECT (i % 50) AS user_id
FROM range(0, 200) t(i);

CREATE OR REPLACE TABLE events_feb AS
SELECT (20 + (i % 50)) AS user_id  -- overlaps users 20..49 with jan
FROM range(0, 200) t(i);

----------------------------------------------------------------------
-- requests: latency_ms column for KLL / TDigest quantile examples.
-- Static deterministic values (no randomness) so sketch outputs are
-- reproducible across runs.
----------------------------------------------------------------------
CREATE OR REPLACE TABLE requests AS
SELECT (i * 7 % 1000)::INTEGER AS latency_ms
FROM range(0, 500) t(i);

----------------------------------------------------------------------
-- page_views: country_code column for the Frequent Items example.
----------------------------------------------------------------------
CREATE OR REPLACE TABLE page_views AS
SELECT
    (['US','US','US','US','GB','GB','DE','FR','NO','SE','JP','CA','BR','AU','IT'])[1 + (i % 15)]
        AS country_code
FROM range(0, 300) t(i);

----------------------------------------------------------------------
-- measurements: `value` column for the REQ skew-aware quantile
-- example. Mildly skewed via i*i to exercise the rank-error scaling.
----------------------------------------------------------------------
CREATE OR REPLACE TABLE measurements AS
SELECT (i * i)::DOUBLE AS value
FROM range(0, 100) t(i);

----------------------------------------------------------------------
-- daily_uniques: per-day HLL/Theta rollup table referenced by the
-- "Per-day HLL sketches" cookbook recipe, the technical-details
-- "billion-row distinct count" example, the datasketch_hll_union
-- example, and the persist-to-Parquet snippet. Schema matches what
-- the cookbook + functions.json snippets expect: (day DATE, hll
-- sketch_hll). The technical-details snippet builds its own (day,
-- sketch) shape via CREATE TABLE … AS SELECT and PARSE-FAILs on
-- unrelated function-signature drift, so we don't try to satisfy it.
-- CREATE-side snippets that re-create daily_uniques will EXEC-FAIL on
-- duplicate-create — accepted in exchange for SELECT-side PASSes.
----------------------------------------------------------------------
CREATE OR REPLACE TABLE daily_uniques AS
SELECT
    date_trunc('day', ts)         AS day,
    datasketch_hll(12, user_id)   AS hll
FROM events
GROUP BY 1;

----------------------------------------------------------------------
-- readings: temp DOUBLE column for the TDigest cookbook examples.
-- Pre-seeded so the SELECT inside the same snippet binds at EXPLAIN
-- time. The snippet will then re-create with the same shape on
-- execute (EXEC-FAIL acceptable).
----------------------------------------------------------------------
CREATE OR REPLACE TABLE readings AS
SELECT i::DOUBLE AS temp
FROM range(1, 11) t(i);
