CREATE OR REPLACE TABLE updates(id INTEGER, customer_id INTEGER, name VARCHAR, updated_at TIMESTAMP, plan VARCHAR);
INSERT INTO updates VALUES
  (1,101,'Ada','2026-01-08 09:00:00','free'),
  (2,101,'Ada','2026-01-08 10:00:00','team'),
  (3,101,'Ada','2026-01-08 10:00:00','pro'),
  (4,102,'Ben','2026-01-08 09:00:00','pro'),
  (5,102,'Ben','2026-01-08 11:00:00','free'),
  (6,103,'Cy',NULL,'free');


-- Give every update a rank
SELECT id, customer_id, plan,
       row_number() OVER (PARTITION BY customer_id
         ORDER BY updated_at DESC NULLS LAST, id DESC) AS recency_rank
FROM updates ORDER BY customer_id, recency_rank;

-- Choose one complete record per customer
SELECT id, customer_id, name, plan
FROM updates
QUALIFY row_number() OVER (
  PARTITION BY customer_id
  ORDER BY updated_at DESC NULLS LAST, id DESC
) = 1
ORDER BY customer_id;

-- Challenge: Return customer_id and name for customers whose latest record has plan pro. Use the same timestamp and ID tie-break rule.
SELECT customer_id, name
FROM updates WHERE plan = 'pro'
QUALIFY row_number() OVER (PARTITION BY customer_id
  ORDER BY updated_at DESC NULLS LAST, id DESC) = 1
ORDER BY customer_id;

-- One solution
WITH latest AS (
  SELECT customer_id, name, plan FROM updates
  QUALIFY row_number() OVER (PARTITION BY customer_id
    ORDER BY updated_at DESC NULLS LAST, id DESC) = 1
)
SELECT customer_id, name FROM latest
WHERE plan = 'pro' ORDER BY customer_id;
