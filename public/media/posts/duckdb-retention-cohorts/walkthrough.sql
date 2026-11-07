CREATE OR REPLACE TABLE visitors(id INTEGER, name VARCHAR, signed_up DATE);
INSERT INTO visitors VALUES
 (1,'Ada','2026-01-05'), (2,'Ben','2026-01-06'),
 (3,'Cy','2026-01-12'), (4,'Dee','2026-01-13'), (5,'Eli','2026-01-19');
CREATE OR REPLACE TABLE events(id INTEGER, user_id INTEGER, happened_at TIMESTAMP, event VARCHAR);
INSERT INTO events VALUES
 (1,1,'2026-01-05 09:00:00','view'),
 (2,1,'2026-01-05 09:05:00','run'),
 (3,1,'2026-01-05 09:06:00','run'),
 (4,1,'2026-01-05 09:15:00','enquiry'),
 (5,1,'2026-01-05 09:45:00','view'),
 (6,1,'2026-01-05 10:20:00','view'),
 (7,2,'2026-01-06 10:00:00','run'),
 (8,2,'2026-01-06 10:05:00','view'),
 (9,2,'2026-01-06 10:08:00','enquiry'),
 (10,3,'2026-01-12 09:00:00','view'),
 (11,3,'2026-01-12 09:02:00','run'),
 (12,3,'2026-01-12 10:00:00','enquiry'),
 (13,4,'2026-01-13 11:00:00','view'),
 (14,4,'2026-01-13 11:04:00','run'),
 (15,4,'2026-01-13 11:12:00','enquiry'),
 (16,1,'2026-01-14 12:00:00','view'),
 (17,2,'2026-01-20 12:00:00','view'),
 (18,5,'2026-01-19 09:00:00','view'),
 (19,1,'2026-01-20 14:00:00','view');
CREATE OR REPLACE VIEW cohort_members AS
SELECT id AS user_id, date_trunc('week', signed_up)::DATE AS cohort_week FROM visitors;
CREATE OR REPLACE VIEW active_weeks AS
SELECT DISTINCT user_id, date_trunc('week', happened_at)::DATE AS active_week
FROM events WHERE happened_at < TIMESTAMP '2026-01-26 00:00:00';
CREATE OR REPLACE VIEW retention AS
WITH sizes AS (
 SELECT cohort_week, count(*) AS cohort_size FROM cohort_members GROUP BY cohort_week
), counts AS (
 SELECT c.cohort_week, date_diff('week', c.cohort_week, a.active_week) AS week_number,
   count(DISTINCT c.user_id) AS active_users
 FROM cohort_members c JOIN active_weeks a USING(user_id)
 WHERE a.active_week >= c.cohort_week
 GROUP BY c.cohort_week, week_number
)
SELECT s.cohort_week, w.week_number, s.cohort_size,
 CASE WHEN s.cohort_week + w.week_number * INTERVAL 1 WEEK < DATE '2026-01-26'
   THEN coalesce(c.active_users, 0) END AS active_users,
 CASE WHEN s.cohort_week + w.week_number * INTERVAL 1 WEEK < DATE '2026-01-26'
   THEN round(100.0 * coalesce(c.active_users, 0) / s.cohort_size, 1) END AS retention_pct
FROM sizes s CROSS JOIN range(3) w(week_number)
LEFT JOIN counts c ON c.cohort_week = s.cohort_week AND c.week_number = w.week_number;


-- Assign each signup to its Monday cohort
SELECT v.name, c.cohort_week, a.active_week,
  date_diff('week', c.cohort_week, a.active_week) AS week_number
FROM cohort_members c JOIN visitors v ON v.id = c.user_id
JOIN active_weeks a USING(user_id)
ORDER BY c.cohort_week, v.name, a.active_week;


-- Build the cohort grid, leaving future weeks unknown
WITH sizes AS (
 SELECT cohort_week, count(*) AS cohort_size FROM cohort_members GROUP BY cohort_week
), counts AS (
 SELECT c.cohort_week, date_diff('week', c.cohort_week, a.active_week) AS week_number,
   count(DISTINCT c.user_id) AS active_users
 FROM cohort_members c JOIN active_weeks a USING(user_id)
 WHERE a.active_week >= c.cohort_week
 GROUP BY c.cohort_week, week_number
)
SELECT s.cohort_week, w.week_number, s.cohort_size,
 CASE WHEN s.cohort_week + w.week_number * INTERVAL 1 WEEK < DATE '2026-01-26'
   THEN coalesce(c.active_users, 0) END AS active_users,
 CASE WHEN s.cohort_week + w.week_number * INTERVAL 1 WEEK < DATE '2026-01-26'
   THEN round(100.0 * coalesce(c.active_users, 0) / s.cohort_size, 1) END AS retention_pct
FROM sizes s CROSS JOIN range(3) w(week_number)
LEFT JOIN counts c ON c.cohort_week = s.cohort_week AND c.week_number = w.week_number
ORDER BY s.cohort_week, w.week_number;


-- Turn the percentages into a cohort report
PIVOT retention ON week_number IN (0, 1, 2)
USING max(retention_pct) GROUP BY cohort_week, cohort_size
ORDER BY cohort_week;


-- Challenge: Return name for members of the January 5 cohort who were active in week 1 (January 12–18). Return each name once.
SELECT v.name FROM cohort_members c JOIN visitors v ON v.id = c.user_id WHERE c.cohort_week = DATE '2026-01-05' ORDER BY v.name;


-- One solution
SELECT DISTINCT v.name FROM cohort_members c JOIN visitors v ON v.id = c.user_id JOIN active_weeks a USING(user_id) WHERE c.cohort_week = DATE '2026-01-05' AND a.active_week = DATE '2026-01-12' ORDER BY v.name;

