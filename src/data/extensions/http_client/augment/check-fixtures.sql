-- Fixtures for http_client cookbook examples.
-- Provides a `users` table for per-row HTTP enrichment recipes,
-- and a `staging` table for the webhook example.
CREATE TABLE IF NOT EXISTS users (
  id        INTEGER,
  email     VARCHAR,
  login     VARCHAR,
  last_seen TIMESTAMP
);
-- Intentionally empty so per-row enrichment recipes that do real
-- HTTP calls to api.example.com don't fan out and trip parse errors
-- on the empty response body. Schema alone is what these recipes need.

CREATE TABLE IF NOT EXISTS repos (
  id    INTEGER,
  name  VARCHAR,
  owner VARCHAR
);
INSERT INTO repos VALUES (1, 'duckdb', 'duckdb');

CREATE TABLE IF NOT EXISTS staging (
  id   INTEGER,
  data VARCHAR
);
INSERT INTO staging VALUES (1, 'row');
