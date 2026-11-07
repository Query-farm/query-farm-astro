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


-- Two regions have very different request counts
SELECT region, count(*) AS requests,
  quantile_disc(latency_ms, 0.95) AS p95_ms
FROM requests GROUP BY region ORDER BY region;


-- Neither average of regional percentiles is the overall p95
WITH regional AS (
 SELECT count(*) AS n, quantile_disc(latency_ms, 0.95) AS p95
 FROM requests GROUP BY region
)
SELECT (SELECT avg(p95) FROM regional) AS mean_of_p95,
  (SELECT sum(n * p95) / sum(n) FROM regional) AS weighted_mean_of_p95,
  quantile_disc(latency_ms, 0.95) AS overall_p95
FROM requests;


-- Merge the distributions, then ask for percentiles
WITH regional AS (
 SELECT region, datasketch_kll(200, latency_ms) AS sketch
 FROM requests GROUP BY region
), combined AS (
 SELECT datasketch_kll(200, sketch) AS sketch FROM regional
)
SELECT datasketch_kll_quantile(sketch, 0.50, true) AS p50_ms,
  datasketch_kll_quantile(sketch, 0.95, true) AS p95_ms,
  datasketch_kll_quantile(sketch, 0.99, true) AS p99_ms
FROM combined;


-- Challenge: Return one column, p99_ms, containing the exact discrete 99th percentile across all requests.
WITH regional AS (SELECT region, quantile_disc(latency_ms, 0.99) AS p99 FROM requests GROUP BY region) SELECT avg(p99) AS p99_ms FROM regional;


-- One solution
SELECT quantile_disc(latency_ms, 0.99) AS p99_ms FROM requests;

