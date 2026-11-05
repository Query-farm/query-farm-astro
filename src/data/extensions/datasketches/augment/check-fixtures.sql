-- Small source datasets for the independently runnable browser examples.
-- Examples that rebuild a derived table use CREATE OR REPLACE TABLE.

SET VARIABLE example_today = (SELECT CURRENT_DATE);

CREATE OR REPLACE TABLE events AS
SELECT
    (i % 30)                               AS user_id,
    (getvariable('example_today')::DATE + INTERVAL '-14 days')::TIMESTAMP
        + INTERVAL (i) HOUR                AS ts,
    (['US','GB','DE','FR','NO','SE','JP','CA','BR','AU'])[1 + (i % 10)]
                                           AS country_code,
    (['signup','active','dormant'])[1 + (i % 3)]
                                           AS cohort
FROM range(0, 200) t(i);

CREATE OR REPLACE TABLE events_jan AS
SELECT (i % 50) AS user_id
FROM range(0, 200) t(i);

CREATE OR REPLACE TABLE events_feb AS
SELECT (20 + (i % 50)) AS user_id  FROM range(0, 200) t(i);

CREATE OR REPLACE TABLE requests AS
SELECT (i * 7 % 1000)::INTEGER AS latency_ms
FROM range(0, 500) t(i);

CREATE OR REPLACE TABLE page_views AS
SELECT
    (['US','US','US','US','GB','GB','DE','FR','NO','SE','JP','CA','BR','AU','IT'])[1 + (i % 15)]
        AS country_code
FROM range(0, 300) t(i);

CREATE OR REPLACE TABLE measurements AS
SELECT (i * i)::DOUBLE AS value
FROM range(0, 100) t(i);

CREATE OR REPLACE TABLE daily_uniques AS
SELECT
    date_trunc('day', ts)         AS day,
    datasketch_hll(12, user_id)   AS hll
FROM events
GROUP BY 1;

CREATE OR REPLACE TABLE readings AS
SELECT i::DOUBLE AS temp
FROM range(1, 11) t(i);

CREATE OR REPLACE TABLE orders AS
SELECT
    (['widget','widget','gadget','gizmo','doohickey','sprocket'])[1 + (i % 6)]
        AS product,
    (10 + (i * 37 % 90))::BIGINT AS revenue
FROM range(0, 300) t(i);
