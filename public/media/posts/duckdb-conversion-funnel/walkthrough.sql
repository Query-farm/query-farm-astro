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
CREATE OR REPLACE VIEW funnel_steps AS
WITH entries AS (
 SELECT user_id, session_no,
   min(happened_at) FILTER (WHERE event = 'view') AS viewed_at
 FROM session_events GROUP BY user_id, session_no
), runs AS (
 SELECT v.*, min(e.happened_at) AS ran_at
 FROM entries v LEFT JOIN session_events e
   ON e.user_id = v.user_id AND e.session_no = v.session_no
  AND e.event = 'run' AND e.happened_at > v.viewed_at
  AND e.happened_at <= v.viewed_at + INTERVAL 30 MINUTE
 WHERE v.viewed_at IS NOT NULL
 GROUP BY v.user_id, v.session_no, v.viewed_at
)
SELECT r.*, min(e.happened_at) AS enquired_at
FROM runs r LEFT JOIN session_events e
 ON e.user_id = r.user_id AND e.session_no = r.session_no
 AND e.event = 'enquiry' AND e.happened_at > r.ran_at
 AND e.happened_at <= r.viewed_at + INTERVAL 30 MINUTE
GROUP BY r.user_id, r.session_no, r.viewed_at, r.ran_at;


-- A presence-only check counts Ben as a conversion
SELECT user_id, session_no FROM session_events
GROUP BY user_id, session_no
HAVING bool_or(event = 'view') AND bool_or(event = 'run')
   AND bool_or(event = 'enquiry')
ORDER BY user_id, session_no;


-- Choose the first valid event after each preceding step
WITH entries AS (
 SELECT user_id, session_no,
   min(happened_at) FILTER (WHERE event = 'view') AS viewed_at
 FROM session_events GROUP BY user_id, session_no
), runs AS (
 SELECT v.*, min(e.happened_at) AS ran_at
 FROM entries v LEFT JOIN session_events e
   ON e.user_id = v.user_id AND e.session_no = v.session_no
  AND e.event = 'run' AND e.happened_at > v.viewed_at
  AND e.happened_at <= v.viewed_at + INTERVAL 30 MINUTE
 WHERE v.viewed_at IS NOT NULL
 GROUP BY v.user_id, v.session_no, v.viewed_at
)
SELECT r.*, min(e.happened_at) AS enquired_at
FROM runs r LEFT JOIN session_events e
 ON e.user_id = r.user_id AND e.session_no = r.session_no
 AND e.event = 'enquiry' AND e.happened_at > r.ran_at
 AND e.happened_at <= r.viewed_at + INTERVAL 30 MINUTE
GROUP BY r.user_id, r.session_no, r.viewed_at, r.ran_at
ORDER BY r.user_id, r.session_no;


-- Count qualifying sessions, not event rows
SELECT count(*) AS entered,
  count(ran_at) AS ran_example,
  count(enquired_at) AS sent_enquiry,
  round(100.0 * count(enquired_at) / nullif(count(*), 0), 2) AS conversion_pct
FROM funnel_steps;


-- Challenge: Return user_id and session_no for sessions with a view but no qualifying run.
SELECT user_id, session_no FROM funnel_steps WHERE enquired_at IS NULL ORDER BY user_id, session_no;


-- One solution
SELECT user_id, session_no FROM funnel_steps WHERE ran_at IS NULL ORDER BY user_id, session_no;

