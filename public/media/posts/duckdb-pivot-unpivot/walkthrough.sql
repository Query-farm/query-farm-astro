CREATE OR REPLACE TABLE monthly_sales(id INTEGER, region VARCHAR, jan INTEGER, feb INTEGER, mar INTEGER);
INSERT INTO monthly_sales VALUES (1,'North',100,NULL,140), (2,'South',50,70,0);
CREATE OR REPLACE VIEW long_sales AS
SELECT region, month, amount FROM monthly_sales
UNPIVOT INCLUDE NULLS (amount FOR month IN (jan, feb, mar));


-- The simplified form omits the unknown February value
UNPIVOT monthly_sales ON jan, feb, mar
INTO NAME month VALUE amount
ORDER BY region, month;


-- Keep all six cells, including the unknown one
SELECT region, month, amount FROM monthly_sales
UNPIVOT INCLUDE NULLS (amount FOR month IN (jan, feb, mar))
ORDER BY region, month;


-- Choose a stable column order for the report
PIVOT long_sales ON month IN ('jan', 'feb', 'mar')
USING sum(amount) GROUP BY region ORDER BY region;


-- Challenge: Return region and month for the unknown measurement in long_sales. Do not include a recorded zero.
SELECT region, month FROM long_sales WHERE coalesce(amount, 0) = 0 ORDER BY region, month;


-- One solution
SELECT region, month FROM long_sales WHERE amount IS NULL ORDER BY region, month;

