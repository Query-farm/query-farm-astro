-- DuckDB 2.0: install once, then load for the session.
SET allow_extension_repositories='allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL jsonata FROM query_farm;
LOAD jsonata FROM query_farm;

CREATE OR REPLACE TABLE api_orders(id INTEGER, payload JSON);
INSERT INTO api_orders VALUES
 (101,'{"id":101,"buyer":{"name":"Ada"},"currency":"USD","items":[{"sku":"MUG","qty":2,"unit_price":12.5},{"sku":"TEA","qty":1,"unit_price":8}]}'),
 (102,'{"id":102,"buyer":{"name":"Ben"},"currency":"USD","items":[]}'),
 (103,'{"id":103,"buyer":{"name":"Cy"},"currency":"USD","items":[{"sku":"MUG","qty":1,"unit_price":12.5}]}');
