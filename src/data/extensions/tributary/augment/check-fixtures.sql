-- Fixtures for tributary cookbook examples.
-- Provides the local `users` reference table for "Join Kafka with local data".
-- The Kafka topics themselves need a running broker, so those examples stay
-- environment skips in the checker.
CREATE OR REPLACE TABLE users (
  user_id BIGINT,
  name    VARCHAR
);
INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob');
