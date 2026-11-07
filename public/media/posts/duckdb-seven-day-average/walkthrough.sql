CREATE OR REPLACE TABLE daily_orders(id INTEGER, day DATE, orders INTEGER);
INSERT INTO daily_orders VALUES
 (1,'2026-01-01',70), (2,'2026-01-02',0), (3,'2026-01-04',14),
 (4,'2026-01-05',28), (5,'2026-01-08',42), (6,'2026-01-09',56),
 (7,'2026-01-10',70), (8,'2026-01-11',84);
CREATE OR REPLACE VIEW calendar_days AS
SELECT day::DATE AS day FROM generate_series(
 DATE '2026-01-01', DATE '2026-01-11', INTERVAL 1 DAY) AS t(day);
CREATE OR REPLACE VIEW complete_days AS
SELECT c.day, coalesce(o.orders, 0) AS orders
FROM calendar_days c LEFT JOIN daily_orders o USING(day);


-- Compare seven observations with a seven-day interval
WITH moving AS (
 SELECT day, orders,
   round(avg(orders) OVER (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS last_7_rows,
   round(avg(orders) OVER (ORDER BY day RANGE BETWEEN INTERVAL 6 DAY PRECEDING AND CURRENT ROW), 2) AS observed_7_days
 FROM daily_orders
) SELECT * FROM moving WHERE day = DATE '2026-01-11';


-- Show every calendar date, with the zero-fill assumption explicit
SELECT c.day, o.orders AS recorded_orders,
  coalesce(o.orders, 0) AS orders_if_complete
FROM calendar_days c LEFT JOIN daily_orders o USING(day)
WHERE c.day BETWEEN DATE '2026-01-05' AND DATE '2026-01-11'
ORDER BY c.day;


-- Report only full seven-day windows
WITH moving AS (
 SELECT day, count(*) OVER w AS days_in_frame,
   round(avg(orders) OVER w, 2) AS daily_average
 FROM complete_days
 WINDOW w AS (ORDER BY day ROWS BETWEEN 6 PRECEDING AND CURRENT ROW)
) SELECT day, days_in_frame, daily_average FROM moving
WHERE day = DATE '2026-01-11' AND days_in_frame = 7;


-- Challenge: Return day for calendar dates with no source row, across January 1–11. Keep the recorded zero on January 2 out of the result.
SELECT day FROM complete_days WHERE orders = 0 ORDER BY day;


-- One solution
SELECT c.day FROM calendar_days c LEFT JOIN daily_orders o USING(day) WHERE o.id IS NULL ORDER BY c.day;

