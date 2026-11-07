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
