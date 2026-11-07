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
