CREATE OR REPLACE TABLE prices(id INTEGER, sku VARCHAR, effective_at TIMESTAMP, price DECIMAL(10,2));
INSERT INTO prices VALUES
  (1,'WREN','2026-01-08 09:00:00',10),
  (2,'WREN','2026-01-08 09:10:00',12),
  (3,'WREN','2026-01-08 09:25:00',11.50),
  (4,'FIR','2026-01-08 09:05:00',20);
CREATE OR REPLACE TABLE orders(id INTEGER, sku VARCHAR, ordered_at TIMESTAMP, qty INTEGER);
INSERT INTO orders VALUES
  (101,'WREN','2026-01-08 08:55:00',2),
  (102,'WREN','2026-01-08 09:00:00',1),
  (103,'WREN','2026-01-08 09:15:00',3),
  (104,'WREN','2026-01-08 09:30:00',2),
  (105,'FIR','2026-01-08 09:10:00',1);


-- A regular inequality join keeps every earlier price
SELECT o.id, p.effective_at::VARCHAR AS price_time, p.price
FROM orders o LEFT JOIN prices p
  ON o.sku = p.sku AND o.ordered_at >= p.effective_at
WHERE o.id = 104 ORDER BY p.effective_at;

-- Match the closest earlier price for each order
SELECT o.id, o.sku, p.effective_at::VARCHAR AS price_time, p.price
FROM orders o
ASOF LEFT JOIN prices p
  ON o.sku = p.sku AND o.ordered_at >= p.effective_at
ORDER BY o.id;

-- Calculate amounts while preserving the unpriced order
SELECT o.id, o.qty, p.price, o.qty * p.price AS amount
FROM orders o
ASOF LEFT JOIN prices p
  ON o.sku = p.sku AND o.ordered_at >= p.effective_at
ORDER BY o.id;

-- Challenge: Return id for orders with no applicable price at or before their timestamp. Keep the SKU equality condition.
SELECT o.id FROM orders o
LEFT JOIN prices p
  ON o.sku = p.sku AND o.ordered_at = p.effective_at
WHERE p.id IS NULL ORDER BY o.id;

-- One solution
SELECT o.id
FROM orders o
ASOF LEFT JOIN prices p
  ON o.sku = p.sku AND o.ordered_at >= p.effective_at
WHERE p.id IS NULL ORDER BY o.id;
