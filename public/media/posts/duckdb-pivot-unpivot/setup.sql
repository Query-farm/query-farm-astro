CREATE OR REPLACE TABLE monthly_sales(id INTEGER, region VARCHAR, jan INTEGER, feb INTEGER, mar INTEGER);
INSERT INTO monthly_sales VALUES (1,'North',100,NULL,140), (2,'South',50,70,0);
CREATE OR REPLACE VIEW long_sales AS
SELECT region, month, amount FROM monthly_sales
UNPIVOT INCLUDE NULLS (amount FOR month IN (jan, feb, mar));
