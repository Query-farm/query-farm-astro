USE operations.semantic;
SET crossfield_mode = 'strict';

SELECT region, eligible_orders, on_time_orders, on_time_percent
FROM SEMANTIC operations.fulfillment
GROUP BY region
ORDER BY region;

SELECT eligible_orders, on_time_orders, on_time_percent
FROM SEMANTIC operations.fulfillment;

SET crossfield_mode = 'semantic';
WITH current AS (
    SELECT on_time_percent FROM SEMANTIC operations.fulfillment
), proposed AS (
    SELECT on_time_percent FROM SEMANTIC revised.fulfillment
)
SELECT current.on_time_percent AS original_promise_percent,
       proposed.on_time_percent AS revised_promise_percent,
       proposed.on_time_percent - current.on_time_percent AS percentage_point_change
FROM current CROSS JOIN proposed;
