-- Concrete source data for validation, defaults, and quarantine examples.

-- Author-blessed schema-registry recipe (no bind variable).
CREATE OR REPLACE TABLE schema_registry AS
SELECT * FROM (VALUES
  (
    'events.v3',
    1,
    '{"$schema": "https://json-schema.org/draft-07/schema", "type": "object", "properties": {"id": {"type": "integer"}}}'::JSON
  ),
  (
    'events.v2',
    1,
    '{"$schema": "https://json-schema.org/draft-07/schema", "type": "object", "properties": {"id": {"type": "string"}}}'::JSON
  )
) t(name, version, definition);

-- Source / sink / quarantine tables for the validation-and-routing recipes.
-- Payloads are intentionally varied — some valid against a typical "object
-- with id" schema, some not — so the documented TRY wrapper produces both valid and invalid rows.
CREATE OR REPLACE TABLE events AS
SELECT * FROM (VALUES
  (1, '{"id": 1, "type": "click", "ts": "2026-04-28T12:00:00Z"}'::JSON),
  (2, '{"id": 2, "type": "view"}'::JSON),
  (3, '{"id": "not-a-number", "type": "click"}'::JSON),
  (4, '{"type": "missing-id"}'::JSON),
  (5, '{}'::JSON)
) t(row_num, payload);

CREATE OR REPLACE TABLE events_raw AS
SELECT * FROM events;

CREATE OR REPLACE TABLE events_clean (
  row_num INTEGER,
  payload JSON
);

CREATE OR REPLACE TABLE events_quarantine (
  row_num INTEGER,
  payload JSON
);

-- Local JSON input for the file-ingestion example.
COPY (SELECT * FROM (VALUES (1, 'Alice'), (2, 'Bob')) AS people(id, name))
TO 'events.json' (FORMAT JSON, ARRAY true);
