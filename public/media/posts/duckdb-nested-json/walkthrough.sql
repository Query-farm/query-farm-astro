CREATE OR REPLACE TABLE incoming(id INTEGER, payload JSON);
INSERT INTO incoming VALUES
  (101, '{"customer":"Ada","items":[{"sku":"MUG","qty":2},{"sku":"TEA","qty":1}]}'),
  (102, '{"customer":"Ben","items":[]}'),
  (103, '{"customer":"Cy","items":[{"sku":"MUG","qty":1}]}');
CREATE OR REPLACE VIEW orders AS
SELECT id, json_transform(payload,
  '{"customer":"VARCHAR","items":[{"sku":"VARCHAR","qty":"INTEGER"}]}') AS order_data
FROM incoming;


-- Read a field before expanding the array
SELECT id, payload ->> '$.customer' AS customer,
       json_array_length(payload, '$.items') AS item_count
FROM incoming ORDER BY id;

-- Expand one order into its items
SELECT id, order_data.customer AS customer,
       unnest(order_data.items).sku AS sku
FROM orders
ORDER BY id, sku;

-- Keep the order with no items
SELECT o.id, o.order_data.customer AS customer,
       item.sku AS sku, item.qty AS qty
FROM orders o
LEFT JOIN UNNEST(o.order_data.items) AS u(item) ON true
ORDER BY o.id, sku;

-- Challenge: Return id and item_count for every order. Count item rows, not units, and keep orders with zero items.
SELECT o.id, count(*) AS item_count
FROM orders o
LEFT JOIN UNNEST(o.order_data.items) AS u(item) ON true
GROUP BY o.id ORDER BY o.id;

-- One solution
SELECT o.id, count(item.sku) AS item_count
FROM orders o
LEFT JOIN UNNEST(o.order_data.items) AS u(item) ON true
GROUP BY o.id ORDER BY o.id;
