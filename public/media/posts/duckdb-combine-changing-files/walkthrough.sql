CREATE OR REPLACE TABLE early_export(id INTEGER, amount_text VARCHAR);
INSERT INTO early_export VALUES (1,'10.00'), (2,'20.00');
CREATE OR REPLACE TABLE later_export(id INTEGER, amount_text VARCHAR, coupon VARCHAR);
INSERT INTO later_export VALUES (3,'30.50','SAVE'), (4,'pending',NULL);
COPY early_export TO 'schema-early.csv' (FORMAT CSV, HEADER);
COPY later_export TO 'schema-later.csv' (FORMAT CSV, HEADER);
COPY early_export TO 'schema-early.parquet' (FORMAT PARQUET);
COPY later_export TO 'schema-later.parquet' (FORMAT PARQUET);


-- Keep both CSV schemas and retain file provenance
SELECT id::INTEGER AS id, amount_text, coupon,
  parse_filename(filename) AS source_file
FROM read_csv(['schema-early.csv','schema-later.csv'],
  union_by_name = true, all_varchar = true)
ORDER BY id;


-- Combine the Parquet equivalents with a deliberate amount type
SELECT id, try_cast(amount_text AS DECIMAL(10,2)) AS amount,
  coupon, parse_filename(filename) AS source_file
FROM read_parquet(['schema-early.parquet','schema-later.parquet'], union_by_name = true)
ORDER BY id;


-- Keep the original value beside the conversion decision
SELECT id::INTEGER AS id, amount_text,
  try_cast(amount_text AS DECIMAL(10,2)) AS amount,
  CASE WHEN amount_text IS NULL THEN 'missing'
    WHEN try_cast(amount_text AS DECIMAL(10,2)) IS NULL THEN 'review'
    ELSE 'accepted' END AS amount_status
FROM read_csv(['schema-early.csv','schema-later.csv'],
  union_by_name = true, all_varchar = true)
ORDER BY id;


-- Challenge: Return id and amount_text only for non-NULL source amounts that cannot become DECIMAL(10,2). Read both CSV files.
SELECT id::INTEGER AS id, amount_text FROM read_csv(['schema-early.csv','schema-later.csv'], union_by_name=true, all_varchar=true) ORDER BY id;


-- One solution
SELECT id::INTEGER AS id, amount_text FROM read_csv(['schema-early.csv','schema-later.csv'], union_by_name=true, all_varchar=true) WHERE amount_text IS NOT NULL AND try_cast(amount_text AS DECIMAL(10,2)) IS NULL ORDER BY id;

