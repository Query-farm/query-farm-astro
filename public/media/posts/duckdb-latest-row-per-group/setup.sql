CREATE OR REPLACE TABLE updates(id INTEGER, customer_id INTEGER, name VARCHAR, updated_at TIMESTAMP, plan VARCHAR);
INSERT INTO updates VALUES
  (1,101,'Ada','2026-01-08 09:00:00','free'),
  (2,101,'Ada','2026-01-08 10:00:00','team'),
  (3,101,'Ada','2026-01-08 10:00:00','pro'),
  (4,102,'Ben','2026-01-08 09:00:00','pro'),
  (5,102,'Ben','2026-01-08 11:00:00','free'),
  (6,103,'Cy',NULL,'free');
