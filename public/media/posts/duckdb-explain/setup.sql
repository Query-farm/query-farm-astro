CREATE OR REPLACE TABLE orders(id INTEGER, region VARCHAR, status VARCHAR, amount INTEGER);
INSERT INTO orders VALUES
 (1,'North','paid',40),(2,'South','paid',30),
 (3,'North','cancelled',100),(4,'West','paid',20),
 (5,'South','paid',70),(6,'North','paid',60),
 (7,'West','cancelled',50),(8,'East','paid',10);
