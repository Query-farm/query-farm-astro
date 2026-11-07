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
