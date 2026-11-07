CREATE OR REPLACE TABLE orders AS
SELECT i::INTEGER AS id,
       CASE i % 4 WHEN 0 THEN 'East' WHEN 1 THEN 'West'
         WHEN 2 THEN 'North' ELSE 'South' END AS region,
       CASE WHEN i % 5 = 0 THEN 'cancelled' ELSE 'paid' END AS status
FROM generate_series(1, 10000) AS r(i);
CREATE OR REPLACE TABLE promotions(id INTEGER, region VARCHAR, campaign VARCHAR);
INSERT INTO promotions VALUES
 (1,'East','Spring'),(2,'East','Loyalty'),(3,'West','Spring'),(4,'West','Loyalty'),
 (5,'North','Spring'),(6,'North','Loyalty'),(7,'South','Spring'),(8,'South','Loyalty');


-- Run and profile the query with the duplicated matches
EXPLAIN ANALYZE
SELECT count(*) AS qualifying_orders
FROM orders o JOIN promotions p ON o.region = p.region
WHERE o.status = 'paid';

-- See what that query actually counts
SELECT count(*) AS qualifying_orders
FROM orders o JOIN promotions p ON o.region = p.region
WHERE o.status = 'paid';

-- Express eligibility with EXISTS
SELECT count(*) AS qualifying_orders
FROM orders o
WHERE o.status = 'paid'
  AND EXISTS (SELECT 1 FROM promotions p WHERE p.region = o.region);

-- Profile the corrected eligibility query
EXPLAIN ANALYZE
SELECT count(*) AS qualifying_orders
FROM orders o
WHERE o.status = 'paid'
  AND EXISTS (SELECT 1 FROM promotions p WHERE p.region = o.region);

-- Challenge: Return region and qualifying_orders for paid orders with at least one regional campaign. Count each order once.
SELECT o.region, count(*) AS qualifying_orders
FROM orders o JOIN promotions p ON o.region = p.region
WHERE o.status = 'paid'
GROUP BY o.region ORDER BY o.region;

-- One solution
SELECT o.region, count(*) AS qualifying_orders
FROM orders o
WHERE o.status = 'paid'
  AND EXISTS (SELECT 1 FROM promotions p WHERE p.region = o.region)
GROUP BY o.region ORDER BY o.region;
