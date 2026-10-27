-- Result 1: expected/by-store.csv. Each fact keeps its own grain.
SET crossfield_mode = 'strict';
SELECT store_name, order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle
GROUP BY store_name ORDER BY store_name;

-- Result 2: expected/totals.csv. Same definitions without a grouping dimension.
SELECT order_count, item_count, revenue
FROM SEMANTIC jaffle_current.jaffle;

-- Result 3: expected/revisions.csv. Reconcile two definitions over identical rows.
-- Semantic mode permits outer arithmetic over independently governed blocks.
SET crossfield_mode = 'semantic';
WITH previous AS (
    SELECT revenue FROM SEMANTIC jaffle_old.jaffle
), current AS (
    SELECT revenue FROM SEMANTIC jaffle_current.jaffle
)
SELECT p.revenue AS previous_revenue, c.revenue AS current_revenue,
       c.revenue - p.revenue AS change
FROM previous p CROSS JOIN current c;
