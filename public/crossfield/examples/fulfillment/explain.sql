SET crossfield_mode = 'strict';
EXPLAIN (SEMANTIC)
SELECT region, eligible_orders, on_time_orders, on_time_percent
FROM SEMANTIC operations.fulfillment
GROUP BY region
ORDER BY region;
