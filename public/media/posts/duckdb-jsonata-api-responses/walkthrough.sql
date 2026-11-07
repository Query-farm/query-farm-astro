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


-- Build a small document with the field names you need
SELECT id, jsonata('{
  "order_id": id,
  "customer": buyer.name
}', payload)::VARCHAR AS summary
FROM api_orders ORDER BY id;


-- Keep an array shape for zero, one, or many matches
SELECT id, jsonata('[items.sku]', payload)::VARCHAR AS skus,
  jsonata('$count(items)', payload)::INTEGER AS line_count
FROM api_orders ORDER BY id;


-- Compute an order summary inside each JSON document
SELECT id, jsonata('{
  "order_id": id,
  "customer": buyer.name,
  "currency": currency,
  "total": $count(items) = 0 ? 0 : $sum(items.(qty * unit_price)),
  "skus": [items.sku]
}', payload)::VARCHAR AS transformed
FROM api_orders ORDER BY id;


-- Challenge: Return id and skus (a VARCHAR containing a JSON array) for orders with one or more items. Keep the array wrapper even for Cy’s single SKU.
SELECT id, jsonata('[items.sku]', payload)::VARCHAR AS skus FROM api_orders ORDER BY id;


-- One solution
SELECT id, jsonata('[items.sku]', payload)::VARCHAR AS skus FROM api_orders WHERE jsonata('$count(items)', payload)::INTEGER > 0 ORDER BY id;

