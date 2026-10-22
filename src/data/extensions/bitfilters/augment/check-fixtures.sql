-- Fixtures for bitfilters extension SQL examples.
-- Provides realistic small, deterministic data so the validator can
-- parse-check (and where possible execute) the snippets in
-- cookbook.mdx, technical-details.mdx, metadata.json, and functions.json.

-- Source set of ids referenced by xor8/xor16/binary_fuse8/binary_fuse16
-- examples and by the quotient_filter cookbook example. Includes a
-- `bucket` column for the per-partition cookbook example.
CREATE OR REPLACE TABLE ids AS
SELECT i AS id, (i % 4) AS bucket
FROM range(0, 50) t(i);

-- Allowed ids (bucketed) for the "Build a Filter" cookbook snippet.
CREATE OR REPLACE TABLE allowed_ids AS
SELECT i AS id, (i % 4) AS bucket
FROM range(0, 40) t(i);

-- Interesting keys for the "Pre-Filter an Expensive Join" snippet.
CREATE OR REPLACE TABLE interesting_keys AS
SELECT i AS key
FROM range(0, 30) t(i);

-- Events table — referenced with .key, .day, .user_id, .bucket columns.
CREATE OR REPLACE TABLE events AS
SELECT i              AS key,
       (i % 7)        AS day,
       (i % 13)       AS user_id,
       (i % 4)        AS bucket
FROM range(0, 80) t(i);

-- Source set / unrelated set for FPR-verification snippet.
CREATE OR REPLACE TABLE source_set AS
SELECT i AS id FROM range(0, 50) t(i);

CREATE OR REPLACE TABLE unrelated_set AS
SELECT i AS id FROM range(1000, 1050) t(i);

-- Keys table for the DuckDB-compatible Bloom filter cookbook example.
CREATE OR REPLACE TABLE keys AS
SELECT i AS key, (i % 4) AS bucket
FROM range(0, 40) t(i);

-- A pre-built filter referenced by `the_filter` in the FPR snippet.
-- Stored as a single-row table containing one xor8 filter blob.
CREATE OR REPLACE TABLE the_filter AS
SELECT xor8_filter(hash(id)) AS filter FROM source_set;

-- Typed filter columns referenced by *_contains examples in functions.json.
-- Filter blobs are family/width-specific: passing an xor8 blob to a
-- binary_fuse16 probe is invalid and can crash native extension code.
CREATE OR REPLACE TABLE filter_table AS
SELECT xor8_filter(hash(id))          AS xor8_filter_value,
       xor16_filter(hash(id))         AS xor16_filter_value,
       binary_fuse8_filter(hash(id))  AS binary_fuse8_filter_value,
       binary_fuse16_filter(hash(id)) AS binary_fuse16_filter_value
FROM ids;

-- Pre-built `interesting_filter` and `partition_filters` tables so that
-- snippets which both CREATE and reference these tables can EXPLAIN-parse
-- their reference statements (EXPLAIN doesn't actually run the CREATE).
CREATE OR REPLACE TABLE interesting_filter AS
SELECT xor8_filter(hash(key)) AS filter FROM interesting_keys;

CREATE OR REPLACE TABLE partition_filters AS
SELECT day,
       binary_fuse8_filter(hash(user_id)) AS users_in_partition
FROM events
GROUP BY day;

-- Quotient-filter example references `series_data` and groups by id % 2.
CREATE OR REPLACE TABLE series_data AS
SELECT i AS id FROM range(0, 50) t(i);

-- Users / new_signups for the metadata.json quickStart snippet.
CREATE OR REPLACE TABLE users AS
SELECT 'user' || i || '@example.com' AS email
FROM range(0, 30) t(i);

CREATE OR REPLACE TABLE new_signups AS
SELECT 'user' || i || '@example.com' AS email
FROM range(20, 40) t(i);

-- Generic `tbl` referenced by the bitfilters_duckdb_hash and
-- bitfilters_duckdb_bloom_filter_create examples the extension ships in
-- duckdb_functions().
CREATE OR REPLACE TABLE tbl AS
SELECT i AS key, i AS key_col, i AS col1, i * 10 AS col2
FROM range(0, 20) t(i);

-- Per-bucket DuckDB-compatible Bloom filters for the cookbook snippets,
-- built the same way as the cookbook's CREATE TABLE.
CREATE OR REPLACE TABLE zone_filters AS
SELECT bucket,
       bitfilters_duckdb_bloom_filter_create(
         'v2.0', 16384, bitfilters_duckdb_hash('v2.0', key)) AS bf
FROM keys
GROUP BY bucket;
