-- Fixtures for webmacro cookbook examples.
-- Provides a `users(user_id, last_seen)` table for the table-macro
-- definition shown in "Use scalar and table macros".
CREATE TABLE IF NOT EXISTS users (
  user_id   INTEGER,
  last_seen DATE
);
INSERT INTO users VALUES (1, DATE '2026-02-15'), (2, DATE '2026-03-01');
