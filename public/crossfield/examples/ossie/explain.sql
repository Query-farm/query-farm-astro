SET crossfield_mode = 'strict';
EXPLAIN (SEMANTIC)
SELECT orders.revenue AS sales, returns.revenue AS refunds
FROM SEMANTIC local_metrics.scoped_sales;
