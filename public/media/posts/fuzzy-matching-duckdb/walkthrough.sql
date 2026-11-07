-- DuckDB 2.0. Install once, then load in each session.
SET allow_extension_repositories = 'allowed';
CREATE EXTENSION REPOSITORY IF NOT EXISTS query_farm
  WITH PREFIX 'https://duckdb-extensions.query.farm';
INSTALL rapidfuzz FROM query_farm;
LOAD rapidfuzz FROM query_farm;

CREATE OR REPLACE TABLE customers(id, name, country) AS VALUES
  (1, 'North Star Tools', 'US'), (2, 'Acme Tools', 'US'),
  (3, 'Acme Toolco', 'US'), (4, 'Bluebird Labs', 'GB'),
  (5, 'Café Central', 'ES'), (6, 'North Star Tools', 'CA'),
  (7, 'Cedar Works', 'US'), (8, 'Delta Supply', 'DE'),
  (9, 'Cedar Works', 'US');
CREATE OR REPLACE TABLE leads(id, name, country) AS VALUES
  (101, 'tools ACME', 'US'), (102, 'Northstar Tools', 'US'),
  (103, 'Blue Bird Labs', 'GB'), (104, 'North Star Tools', 'MX'),
  (105, 'Cedar Works', 'US'), (106, 'Unknown Studio', 'US'),
  (107, 'Acme Tools', 'US');
CREATE OR REPLACE MACRO name_key(s) AS
  lower(trim(regexp_replace(s, '\s+', ' ', 'g')));
CREATE OR REPLACE VIEW candidates AS
SELECT l.id AS lead_id, c.id AS customer_id, c.name AS customer,
       rapidfuzz_token_sort_ratio(name_key(l.name), name_key(c.name)) AS score
FROM leads l JOIN customers c ON l.country = c.country
WHERE nullif(name_key(l.name), '') IS NOT NULL
  AND nullif(name_key(c.name), '') IS NOT NULL;
CREATE OR REPLACE VIEW ranked AS
SELECT *, row_number() OVER w AS rank,
       lead(score) OVER w AS runner_up
FROM candidates
WINDOW w AS (PARTITION BY lead_id ORDER BY score DESC, customer_id);
CREATE OR REPLACE TABLE labels(lead_id, customer_id) AS VALUES
  (101, 2), (102, 1), (103, 4), (104, 6), (105, 7), (107, 2);

-- Compare spelling and word order
SELECT l.name AS incoming, c.name AS reference,
       round(rapidfuzz_ratio(name_key(l.name), name_key(c.name)), 1) AS ratio,
       round(rapidfuzz_token_sort_ratio(name_key(l.name), name_key(c.name)), 1) AS token_sort
FROM leads l JOIN labels t ON l.id = t.lead_id
JOIN customers c ON c.id = t.customer_id
WHERE l.id IN (101, 102, 103)
ORDER BY l.id;

-- Count comparisons before scoring
SELECT
  (SELECT count(*) FROM leads CROSS JOIN customers) AS all_pairs,
  (SELECT count(*) FROM leads l JOIN customers c
     ON l.country = c.country) AS candidate_pairs;

-- Produce a review queue
SELECT l.id, l.name, r.customer,
       round(r.score, 1) AS score,
       round(r.score - r.runner_up, 1) AS gap,
       CASE
         WHEN r.customer_id IS NULL THEN 'no candidates'
         WHEN r.score < 85 THEN 'below threshold'
         WHEN r.runner_up IS NOT NULL AND r.score - r.runner_up < 10
           THEN 'review: close scores'
         ELSE 'suggested match'
       END AS decision
FROM leads l LEFT JOIN ranked r
  ON l.id = r.lead_id AND r.rank = 1
ORDER BY l.id;

-- Find known matches the candidate rule excluded
SELECT t.lead_id, l.country AS recorded_country,
       c.id AS true_customer_id, c.country AS true_country
FROM labels t
JOIN leads l ON l.id = t.lead_id
JOIN customers c ON c.id = t.customer_id
WHERE NOT EXISTS (
  SELECT 1 FROM candidates p
  WHERE p.lead_id = t.lead_id AND p.customer_id = t.customer_id
);

-- Find possible duplicates within the customer table
SELECT a.id AS first_id, b.id AS second_id,
       a.name AS first_name, b.name AS second_name
FROM customers a JOIN customers b
  ON a.country = b.country AND a.id < b.id
WHERE nullif(name_key(a.name), '') IS NOT NULL
  AND nullif(name_key(b.name), '') IS NOT NULL
  AND rapidfuzz_token_sort_ratio(
    name_key(a.name), name_key(b.name)
  ) >= 95;
