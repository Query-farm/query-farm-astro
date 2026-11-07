-- DuckDB 2.0: install once, then load for the session.
SET allow_extension_repositories='allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL datasketches FROM query_farm;
LOAD datasketches FROM query_farm;

CREATE OR REPLACE TABLE events(id INTEGER, day DATE, visitor_id VARCHAR);
INSERT INTO events VALUES
  (1,'2026-01-01','Ada'),(2,'2026-01-01','Ben'),(3,'2026-01-01','Cy'),(4,'2026-01-01','Ada'),
  (5,'2026-01-02','Ben'),(6,'2026-01-02','Cy'),(7,'2026-01-02','Dee'),
  (8,'2026-01-03','Ada'),(9,'2026-01-03','Eli');
CREATE OR REPLACE TABLE daily_sketches AS
SELECT day, datasketch_hll(12, visitor_id) AS sketch
FROM events GROUP BY day;


-- Count distinct IDs within each day
SELECT day::VARCHAR AS day, count(DISTINCT visitor_id) AS unique_visitors
FROM events GROUP BY day ORDER BY day;

-- Compare adding counts with counting the union
WITH daily AS (SELECT day, count(DISTINCT visitor_id) AS n FROM events GROUP BY day)
SELECT (SELECT sum(n) FROM daily) AS sum_of_daily_counts,
       (SELECT count(DISTINCT visitor_id) FROM events) AS period_unique_visitors;

-- Estimate the union from saved daily sketches
SELECT round(datasketch_hll_estimate(
  datasketch_hll_union(12, sketch)
), 2) AS estimated_visitors
FROM daily_sketches;

-- Challenge: Return estimated_visitors for January 1–2 using the stored daily sketches. Round the estimate to two decimal places.
SELECT sum(n) AS estimated_visitors
FROM (SELECT day, count(DISTINCT visitor_id) AS n
      FROM events WHERE day <= DATE '2026-01-02' GROUP BY day);

-- One solution
SELECT round(datasketch_hll_estimate(
  datasketch_hll_union(12, sketch)
), 2) AS estimated_visitors
FROM daily_sketches
WHERE day <= DATE '2026-01-02';
