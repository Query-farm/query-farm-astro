-- DuckDB 2.0: install once, then load for the session.
SET allow_extension_repositories='allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL json_schema FROM query_farm;
LOAD json_schema FROM query_farm;

CREATE OR REPLACE TABLE contract(definition JSON);
INSERT INTO contract VALUES ('{
  "type":"object", "required":["order_id","total","status"],
  "properties":{
    "order_id":{"type":"integer"},
    "total":{"type":"number","minimum":0},
    "status":{"type":"string","enum":["paid","cancelled"]}
  }
}');
CREATE OR REPLACE TABLE incoming(id INTEGER, payload JSON);
INSERT INTO incoming VALUES
  (1,'{"order_id":101,"total":40,"status":"paid"}'),
  (2,'{"order_id":102,"total":15,"status":"cancelled"}'),
  (3,'{"order_id":103,"total":"40","status":"paid"}'),
  (4,'{"order_id":104,"total":-5,"status":"paid"}'),
  (5,'{"order_id":105,"total":10}'), (6,NULL);


-- Check the contract separately
SELECT json_schema_validate_schema(definition) AS schema_ok FROM contract;

-- Classify every incoming record
SELECT id, COALESCE(TRY(json_schema_validate(definition, payload)), false) AS valid
FROM incoming CROSS JOIN contract ORDER BY id;

-- Summarize the quality gate
WITH checked AS (
  SELECT COALESCE(TRY(json_schema_validate(definition, payload)), false) AS valid
  FROM incoming CROSS JOIN contract
)
SELECT count(*) AS received, count(*) FILTER (WHERE valid) AS accepted,
       count(*) FILTER (WHERE NOT valid) AS rejected
FROM checked;

-- Challenge: Return id for records that satisfy the contract and have status paid. A paid label alone is not enough.
SELECT id FROM incoming
WHERE payload ->> '$.status' = 'paid'
ORDER BY id;

-- One solution
SELECT id FROM incoming CROSS JOIN contract
WHERE COALESCE(TRY(json_schema_validate(definition, payload)), false)
  AND payload ->> '$.status' = 'paid'
ORDER BY id;
