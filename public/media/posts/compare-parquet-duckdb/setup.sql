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
