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
