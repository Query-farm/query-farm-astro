-- DuckDB 2.0: install once, then load for the session.
SET allow_extension_repositories='allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL hashfuncs FROM query_farm;
LOAD hashfuncs FROM query_farm;

CREATE OR REPLACE TABLE experiment_users(id INTEGER, user_id VARCHAR);
INSERT INTO experiment_users VALUES (1,'Ada'),(2,'Ben'),(3,'Cy'),(4,'Dee'),
 (5,'Eli'),(6,'Fay'),(7,'Gus'),(8,'Hao');
CREATE OR REPLACE VIEW assignments AS
SELECT user_id, (xxh3_64('onboarding-v1:' || user_id, 42) % 100)::INTEGER AS bucket
FROM experiment_users;


-- Use an explicit input, algorithm, seed, and bucket count
SELECT user_id,
  (xxh3_64('onboarding-v1:' || user_id, 42) % 100)::INTEGER AS bucket
FROM experiment_users ORDER BY user_id;


-- Grow the treatment group without changing the hash contract
SELECT user_id, bucket,
  CASE WHEN bucket < 20 THEN 'treatment' ELSE 'control' END AS rollout_20,
  CASE WHEN bucket < 50 THEN 'treatment' ELSE 'control' END AS rollout_50
FROM assignments ORDER BY user_id;


-- Add Ivy without renumbering the existing users
WITH expanded AS (
 SELECT user_id FROM experiment_users UNION ALL SELECT 'Ivy'
)
SELECT user_id,
  (xxh3_64('onboarding-v1:' || user_id, 42) % 100)::INTEGER AS bucket
FROM expanded ORDER BY user_id;


-- Challenge: Return user_id and bucket for users who move from control at 20% to treatment at 50%.
SELECT user_id, bucket FROM assignments WHERE bucket < 50 ORDER BY user_id;


-- One solution
SELECT user_id, bucket FROM assignments WHERE bucket >= 20 AND bucket < 50 ORDER BY user_id;

