SET crossfield_mode = 'strict';
EXPLAIN (SEMANTIC)
SELECT store_name, order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle
GROUP BY store_name ORDER BY store_name;
