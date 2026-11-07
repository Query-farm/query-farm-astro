-- DuckDB 2.0: install once, then load for the session.
SET allow_extension_repositories='allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL datasketches FROM query_farm;
LOAD datasketches FROM query_farm;

CREATE OR REPLACE TABLE requests AS
SELECT i::INTEGER AS id,
 CASE WHEN i <= 95 THEN 'fast' ELSE 'slow' END AS region,
 CASE WHEN i <= 95 THEN 100.0 ELSE 1000.0 END::DOUBLE AS latency_ms
FROM range(1,101) t(i);
