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
