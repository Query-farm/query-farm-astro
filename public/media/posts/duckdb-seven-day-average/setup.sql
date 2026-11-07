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
