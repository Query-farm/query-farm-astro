-- Fixtures for json_schema cookbook / functions / quickstart examples.
--
-- Most cookbook recipes reference a JSON `payload` column together with a
-- `:schema` (or `:event_schema`) bind variable. The check-examples harness
-- substitutes every `:name` reference with a literal `'<__BIND_name__>'`
-- string placeholder before execution — that placeholder is not valid JSON,
-- so any executable snippet that touches `json_schema_validate(:schema, ...)`
-- will hit a "Malformed JSON" Conversion Error at execute time. There is no
-- way for this fixture file to feed real bind values past that substitution.
--
-- Strategy: only create fixture tables for snippets that do NOT use a bind
-- variable. Snippets that do use a bind variable stay as PARSE-SKIP (table
-- fixture missing) — same as the pre-fixture baseline. Creating those tables
-- here would only convert PARSE-SKIPs into EXEC-FAILs.
--
-- Idempotent (CREATE OR REPLACE / DROP IF EXISTS).

-- Used by:
--   functions.json:json_schema_validate_schema.examples[1]
--   cookbook.mdx:L48-L50  (lint-the-registry recipe — no bind var)
-- Both run `SELECT name, version FROM schema_registry WHERE NOT
-- json_schema_validate_schema(definition);` directly, so this table is
-- enough to take them from PARSE-SKIP to PASS.
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
