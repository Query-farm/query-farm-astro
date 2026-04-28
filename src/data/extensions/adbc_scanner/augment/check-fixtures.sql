-- Fixtures for adbc_scanner cookbook examples.
-- Provides a `staging_users(id, name)` source table used by the
-- "Bulk insert from a DuckDB query" example in Mutation.
CREATE TABLE IF NOT EXISTS staging_users (
  id   INTEGER,
  name VARCHAR
);
INSERT INTO staging_users VALUES (1, 'Alice'), (2, 'Bob');

-- A `new_users(id, name)` source table for any future ETL recipes.
CREATE TABLE IF NOT EXISTS new_users (
  id   INTEGER,
  name VARCHAR
);
INSERT INTO new_users VALUES (3, 'Carol');
