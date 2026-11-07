CREATE OR REPLACE TABLE previous_snapshot(id INTEGER, name VARCHAR, plan VARCHAR);
INSERT INTO previous_snapshot VALUES
  (1, 'Ada', 'free'), (2, 'Ben', NULL), (3, 'Cy', 'pro'),
  (4, 'Dee', 'free'), (6, 'Finn', NULL);
CREATE OR REPLACE TABLE current_snapshot(id INTEGER, name VARCHAR, plan VARCHAR);
INSERT INTO current_snapshot VALUES
  (1, 'Ada', 'pro'), (2, 'Ben', 'free'), (4, 'Dee', 'free'),
  (5, 'Eli', 'free'), (6, 'Finn', NULL);
SET VARIABLE snapshot_prefix = 'qf_' || uuid()::VARCHAR;
COPY previous_snapshot TO (getvariable('snapshot_prefix') || '_previous.parquet')
  (FORMAT PARQUET);
COPY current_snapshot TO (getvariable('snapshot_prefix') || '_current.parquet')
  (FORMAT PARQUET);
CREATE OR REPLACE VIEW previous AS
SELECT * FROM read_parquet(getvariable('snapshot_prefix') || '_previous.parquet');
CREATE OR REPLACE VIEW current AS
SELECT * FROM read_parquet(getvariable('snapshot_prefix') || '_current.parquet');

-- Check both snapshots for invalid keys
SELECT 'previous' AS snapshot, id, count(*) AS occurrences
FROM previous GROUP BY id HAVING id IS NULL OR count(*) > 1
UNION ALL
SELECT 'current', id, count(*)
FROM current GROUP BY id HAVING id IS NULL OR count(*) > 1;

-- Find additions, deletions, and changes
SELECT coalesce(p.id, c.id) AS id,
       CASE WHEN p.id IS NULL THEN 'added'
            WHEN c.id IS NULL THEN 'deleted'
            ELSE 'changed' END AS change,
       p.name AS old_name, c.name AS new_name,
       p.plan AS old_plan, c.plan AS new_plan
FROM previous p FULL OUTER JOIN current c ON p.id = c.id
WHERE p.id IS NULL OR c.id IS NULL
   OR p.name IS DISTINCT FROM c.name
   OR p.plan IS DISTINCT FROM c.plan
ORDER BY id;

-- See why ordinary inequality loses changes
SELECT p.id, p.plan AS old_plan, c.plan AS new_plan,
       p.plan <> c.plan AS ordinary_inequality,
       p.plan IS DISTINCT FROM c.plan AS changed
FROM previous p JOIN current c ON p.id = c.id
ORDER BY p.id;

-- Introduce a duplicate and rerun the key check
WITH example(id, name) AS (
  VALUES (1, 'Ada'), (1, 'Ada duplicate'), (2, 'Ben')
)
SELECT id, count(*) AS occurrences
FROM example GROUP BY id
HAVING id IS NULL OR count(*) > 1;
