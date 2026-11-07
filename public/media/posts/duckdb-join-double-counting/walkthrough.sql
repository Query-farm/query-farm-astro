CREATE OR REPLACE TABLE orders(id INTEGER, customer VARCHAR, order_total INTEGER);
INSERT INTO orders VALUES (101,'Ada',100),(102,'Ben',60),(103,'Cy',80);
CREATE OR REPLACE TABLE items(id INTEGER, order_id INTEGER, sku VARCHAR, line_total INTEGER);
INSERT INTO items VALUES
  (1,101,'MUG',60),(2,101,'TEA',40),(3,102,'TEA',60),
  (4,103,'BOWL',50),(5,103,'SPOON',30);


-- See the repeated order totals
SELECT o.id, i.sku, o.order_total
FROM orders o JOIN items i ON i.order_id = o.id
ORDER BY o.id, i.id;

-- Sum the expanded result
SELECT sum(o.order_total) AS revenue
FROM orders o JOIN items i ON i.order_id = o.id;

-- Aggregate items before joining
WITH item_totals AS (
  SELECT order_id, count(*) AS item_count, sum(line_total) AS item_total
  FROM items GROUP BY order_id
)
SELECT o.id, o.customer, o.order_total, i.item_count, i.item_total
FROM orders o LEFT JOIN item_totals i ON i.order_id = o.id
ORDER BY o.id;

-- Count each order once
SELECT sum(order_total) AS revenue FROM orders;

-- Challenge: Return one column, revenue, summing order_total once for each order that has at least two item rows.
SELECT sum(o.order_total) AS revenue
FROM orders o JOIN items i ON i.order_id = o.id
WHERE o.id IN (SELECT order_id FROM items GROUP BY order_id HAVING count(*) >= 2);

-- One solution
SELECT sum(order_total) AS revenue
FROM orders
WHERE id IN (
  SELECT order_id FROM items
  GROUP BY order_id HAVING count(*) >= 2
);
