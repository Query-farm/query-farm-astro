-- Fixture for the airport extension.
--
-- The Query.Farm public demo Flight server (`hello-airport.query.farm`)
-- exposes static and chat schemas the cookbook references. Pre-creating a
-- secret here means the cookbook's `ATTACH 'grpc+tls://hello-airport.query.farm'`
-- snippet picks up auth context naturally and the chat-schema INSERT picks up
-- the auto-assigned identity. The server is publicly readable, anonymous, and
-- TLS-fronted — if it goes offline the recipes fall back to EXEC-SKIP via the
-- network-unreachable classifier.
--
-- See https://airport.query.farm for the demo's documentation.

CREATE OR REPLACE SECRET airport_demo (
  TYPE airport,
  scope 'grpc+tls://hello-airport.query.farm'
);

-- Local-DuckDB tables referenced by the bulk-insert / mutation recipes.
CREATE OR REPLACE TABLE staging_new_events AS
SELECT * FROM (VALUES
  (1, 'click', TIMESTAMP '2026-04-28 10:00:00'),
  (2, 'view',  TIMESTAMP '2026-04-28 10:01:00')
) t(user_id, event_type, ts);
