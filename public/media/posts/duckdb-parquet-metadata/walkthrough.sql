CREATE OR REPLACE TABLE events AS
SELECT i::INTEGER AS id,
       DATE '2026-01-01' + (i // 2048)::INTEGER AS event_day,
       (i % 100)::INTEGER AS value
FROM range(8192) AS r(i);
SET VARIABLE sorted_file = 'sorted_' || uuid()::VARCHAR || '.parquet';
SET VARIABLE mixed_file = 'mixed_' || uuid()::VARCHAR || '.parquet';
COPY (SELECT * FROM events ORDER BY event_day, id)
TO (getvariable('sorted_file')) (FORMAT PARQUET, ROW_GROUP_SIZE 2048);
COPY (SELECT * FROM events ORDER BY id % 2048, event_day)
TO (getvariable('mixed_file')) (FORMAT PARQUET, ROW_GROUP_SIZE 2048);


-- Inspect the date column in the sorted file
SELECT row_group_id, row_group_num_rows AS rows,
       stats_min_value AS first_day, stats_max_value AS last_day
FROM parquet_metadata(getvariable('sorted_file'))
WHERE path_in_schema = 'event_day' ORDER BY row_group_id;

-- Inspect the same records interleaved across row groups
SELECT row_group_id, row_group_num_rows AS rows,
       stats_min_value AS first_day, stats_max_value AS last_day
FROM parquet_metadata(getvariable('mixed_file'))
WHERE path_in_schema = 'event_day' ORDER BY row_group_id;

-- Both layouts answer the same filter
SELECT 'sorted' AS layout, count(*) AS matching_rows
FROM read_parquet(getvariable('sorted_file')) WHERE event_day = DATE '2026-01-02'
UNION ALL
SELECT 'mixed', count(*)
FROM read_parquet(getvariable('mixed_file')) WHERE event_day = DATE '2026-01-02';

-- Challenge: Return row_group_id for groups in sorted_file whose event_day statistics do not rule out January 3. Retain groups with missing or unparseable bounds.
SELECT row_group_id
FROM parquet_metadata(getvariable('sorted_file'))
WHERE path_in_schema = 'event_day'
ORDER BY row_group_id;

-- One solution
SELECT row_group_id
FROM parquet_metadata(getvariable('sorted_file'))
WHERE path_in_schema = 'event_day'
  AND (TRY_CAST(stats_min_value AS DATE) IS NULL
       OR TRY_CAST(stats_min_value AS DATE) <= DATE '2026-01-03')
  AND (TRY_CAST(stats_max_value AS DATE) IS NULL
       OR TRY_CAST(stats_max_value AS DATE) >= DATE '2026-01-03')
ORDER BY row_group_id;
