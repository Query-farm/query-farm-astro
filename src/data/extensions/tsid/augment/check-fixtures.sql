-- Fixtures for tsid cookbook / functions / technical-details examples.
-- Idempotent: uses CREATE OR REPLACE so re-running is safe.
--
-- tsid() is non-deterministic, so we seed the events table with literal
-- 32-char hex strings (the TSID rendering) rather than calling tsid().
-- The values are time-ordered by ordinary string compare, matching the
-- property the cookbook examples demonstrate.

CREATE OR REPLACE TABLE events (
  id      VARCHAR PRIMARY KEY,
  payload JSON
);

INSERT INTO events(id, payload) VALUES
  ('675716e86985495e9cf575f0b9c4a8db', '{"type":"login"}'),
  ('675716e96985495e9cf575f0b9c4a8dc', '{"type":"click"}'),
  ('675716ea6985495e9cf575f0b9c4a8dd', '{"type":"logout"}');

-- Bind variable referenced as :last_id_from_page_1 in the pagination recipe.
SET VARIABLE last_id_from_page_1 = '675716ea6985495e9cf575f0b9c4a8dd';
