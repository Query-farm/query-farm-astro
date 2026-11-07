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
