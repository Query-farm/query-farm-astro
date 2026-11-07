CREATE OR REPLACE TABLE invoice_source(id VARCHAR, billed_on VARCHAR, amount VARCHAR);
INSERT INTO invoice_source VALUES
  ('1','2026-01-01','42.50'), ('2','2026-01-02',' 19.95 '),
  ('3','2026-01-02','pending'), ('4','2026-01-03',NULL),
  ('5','2026-02-30','10.00'), ('6','2026-01-03','-5.00'),
  ('7','2026-01-04','1,200.00');
SET VARIABLE invoice_csv = 'invoices_' || uuid()::VARCHAR || '.csv';
COPY invoice_source TO (getvariable('invoice_csv')) (FORMAT CSV, HEADER);
CREATE OR REPLACE VIEW raw_invoices AS
SELECT * FROM read_csv(getvariable('invoice_csv'), all_varchar = true);
CREATE OR REPLACE VIEW parsed_invoices AS
SELECT id, billed_on, amount,
       try_strptime(trim(billed_on), '%Y-%m-%d')::DATE AS parsed_date,
       TRY_CAST(replace(trim(amount), ',', '') AS DECIMAL(12,2)) AS parsed_amount
FROM raw_invoices;
CREATE OR REPLACE VIEW reviewed_invoices AS
SELECT *, CASE
  WHEN parsed_date IS NULL THEN 'invalid date'
  WHEN amount IS NULL OR trim(amount) = '' THEN 'missing amount'
  WHEN parsed_amount IS NULL THEN 'invalid amount'
  WHEN parsed_amount < 0 THEN 'negative invoice'
  ELSE NULL END AS issue
FROM parsed_invoices;
