CREATE OR REPLACE TABLE customers(id INTEGER, name VARCHAR);
INSERT INTO customers VALUES (1,'Ada'), (2,'Ben'), (3,'Cy'), (4,'Dee');
CREATE OR REPLACE TABLE orders(id INTEGER, customer_id INTEGER);
INSERT INTO orders VALUES (101,1), (102,1), (103,NULL), (104,3);


-- Inspect the predicate before putting it in WHERE
SELECT id, name,
  id NOT IN (SELECT customer_id FROM orders) AS passes_not_in
FROM customers ORDER BY id;


-- Keep customers with no matching order
SELECT c.id, c.name FROM customers c
ANTI JOIN orders o ON c.id = o.customer_id
ORDER BY c.id;


-- Express the same existence test with a correlated subquery
SELECT c.id, c.name FROM customers c
WHERE NOT EXISTS (
  SELECT 1 FROM orders o WHERE o.customer_id = c.id
) ORDER BY c.id;


-- Challenge: Return order_id for orders with no matching customer, including orders with a NULL customer_id.
SELECT id AS order_id FROM orders WHERE customer_id NOT IN (SELECT id FROM customers) ORDER BY id;


-- One solution
SELECT o.id AS order_id FROM orders o ANTI JOIN customers c ON o.customer_id = c.id ORDER BY o.id;

