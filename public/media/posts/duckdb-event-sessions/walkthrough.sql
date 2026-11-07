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
CREATE OR REPLACE VIEW session_events AS
WITH gaps AS (
 SELECT *, lag(happened_at) OVER (
   PARTITION BY user_id ORDER BY happened_at, id
 ) AS previous_at FROM events
), starts AS (
 SELECT *, CASE WHEN previous_at IS NULL
   OR happened_at - previous_at > INTERVAL 30 MINUTE
   THEN 1 ELSE 0 END AS new_session
 FROM gaps
)
SELECT id, user_id, happened_at, event,
 sum(new_session) OVER (
   PARTITION BY user_id ORDER BY happened_at, id
   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
 )::INTEGER AS session_no
FROM starts;


-- Inspect Ada’s gaps before assigning sessions
SELECT id, event, happened_at::TIME::VARCHAR AS time,
  date_diff('minute', lag(happened_at) OVER (
    ORDER BY happened_at, id), happened_at) AS gap_minutes
FROM events WHERE user_id = 1 AND happened_at::DATE = DATE '2026-01-05'
ORDER BY happened_at, id;


-- Start a session only when the gap exceeds 30 minutes
WITH gaps AS (
 SELECT *, lag(happened_at) OVER (
   PARTITION BY user_id ORDER BY happened_at, id
 ) AS previous_at FROM events
), starts AS (
 SELECT *, CASE WHEN previous_at IS NULL
   OR happened_at - previous_at > INTERVAL 30 MINUTE
   THEN 1 ELSE 0 END AS new_session
 FROM gaps
)
SELECT id, user_id, happened_at, event,
 sum(new_session) OVER (
   PARTITION BY user_id ORDER BY happened_at, id
   ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
 )::INTEGER AS session_no
FROM starts
ORDER BY user_id, happened_at, id;


-- Inspect Ada’s first two sessions
SELECT session_no, count(*) AS events,
  min(happened_at)::TIME::VARCHAR AS start_time,
  date_diff('minute', min(happened_at), max(happened_at)) AS observed_minutes,
  bool_or(event IN ('run','enquiry')) AS engaged
FROM session_events
WHERE user_id = 1 AND happened_at::DATE = DATE '2026-01-05'
GROUP BY session_no ORDER BY session_no;


-- Challenge: Return session_no for Ada (user_id = 1) where the session contains exactly one event, across the whole dataset.
SELECT session_no FROM session_events WHERE user_id = 1 GROUP BY session_no ORDER BY session_no;


-- One solution
SELECT session_no FROM session_events WHERE user_id = 1 GROUP BY session_no HAVING count(*) = 1 ORDER BY session_no;

