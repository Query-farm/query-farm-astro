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
