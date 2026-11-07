CREATE OR REPLACE TABLE early_export(id INTEGER, amount_text VARCHAR);
INSERT INTO early_export VALUES (1,'10.00'), (2,'20.00');
CREATE OR REPLACE TABLE later_export(id INTEGER, amount_text VARCHAR, coupon VARCHAR);
INSERT INTO later_export VALUES (3,'30.50','SAVE'), (4,'pending',NULL);
COPY early_export TO 'schema-early.csv' (FORMAT CSV, HEADER);
COPY later_export TO 'schema-later.csv' (FORMAT CSV, HEADER);
COPY early_export TO 'schema-early.parquet' (FORMAT PARQUET);
COPY later_export TO 'schema-later.parquet' (FORMAT PARQUET);
