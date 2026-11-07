CREATE OR REPLACE TABLE orders AS
SELECT i AS id,
       CASE i % 4 WHEN 0 THEN 'East' WHEN 1 THEN 'West'
         WHEN 2 THEN 'North' ELSE 'South' END AS region,
       (i % 100 + 1)::INTEGER AS amount,
       CASE WHEN i % 5 = 0 THEN 'cancelled' ELSE 'paid' END AS status
FROM generate_series(1, 10000) AS s(i);

-- Run the same calculation on local browser data
SELECT region, sum(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY region
ORDER BY region;
