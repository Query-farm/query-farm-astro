CREATE OR REPLACE TABLE orders(id INTEGER, region VARCHAR, status VARCHAR, amount INTEGER);
INSERT INTO orders VALUES
 (1,'North','paid',40),(2,'South','paid',30),
 (3,'North','cancelled',100),(4,'West','paid',20),
 (5,'South','paid',70),(6,'North','paid',60),
 (7,'West','cancelled',50),(8,'East','paid',10);


-- Ask DuckDB how it plans to answer the question
EXPLAIN
SELECT region, sum(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY region
ORDER BY total DESC, region;

-- Now run the query and see the answer
SELECT region, sum(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY region
ORDER BY total DESC, region;

-- Challenge: Return region and total. The scan keeps paid orders; the aggregate sums amount by region. Return those regional totals.
SELECT region, sum(amount) AS total
FROM orders
GROUP BY region
ORDER BY total DESC, region;

-- One solution
SELECT region, sum(amount) AS total
FROM orders
WHERE status = 'paid'
GROUP BY region
ORDER BY total DESC, region;
