-- Fixtures for redis cookbook examples.
-- Provides a `users(id, name)` target table and a `new_users(id, name)`
-- source table for the bulk-write recipe in "String operations".
CREATE TABLE IF NOT EXISTS users (
  id   INTEGER,
  name VARCHAR
);
CREATE TABLE IF NOT EXISTS new_users (
  id   INTEGER,
  name VARCHAR
);
INSERT INTO new_users VALUES (1, 'Alice'), (2, 'Bob');
