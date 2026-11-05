-- Independently authored synthetic order and shipment data. Dates are UTC business dates.
ATTACH ':memory:' AS warehouse;
CREATE TABLE warehouse.orders(id VARCHAR PRIMARY KEY, region VARCHAR, status VARCHAR,
 original_promised_date DATE, revised_promised_date DATE, ordered_units INTEGER);
INSERT INTO warehouse.orders VALUES
 ('A100','North','open','2024-01-31','2024-01-31',2),
 ('A101','North','open','2024-01-31','2024-02-02',2),
 ('A102','South','open','2024-01-31','2024-01-31',2),
 ('A103','South','open','2024-01-31','2024-01-31',1),
 ('A104','North','cancelled','2024-01-31','2024-01-31',1),
 ('A105','South','open','2024-02-05','2024-02-05',1),
 ('A106','North','open','2024-01-30','2024-01-30',1);
CREATE TABLE warehouse.shipments(id INTEGER PRIMARY KEY, order_id VARCHAR, delivered_date DATE, units INTEGER);
INSERT INTO warehouse.shipments VALUES
 (1,'A100','2024-01-30',1), (2,'A100','2024-01-31',1),
 (3,'A101','2024-01-31',1), (4,'A101','2024-02-02',1),
 (5,'A102','2024-01-31',1), (6,'A103','2024-01-31',1),
 (7,'A106','2024-01-30',1), (8,'A102','2024-02-05',1);
-- Normalize the source to one fact per order, using only deliveries observed through Feb 3.
-- No delivery means zero delivered units, and its last-delivery date remains NULL.
CREATE TABLE warehouse.order_facts AS
SELECT o.*, COALESCE(s.delivered_units,0) AS delivered_units, s.last_delivered_date
FROM warehouse.orders o LEFT JOIN (
 SELECT order_id, SUM(units) AS delivered_units, MAX(delivered_date) AS last_delivered_date
 FROM warehouse.shipments WHERE delivered_date < DATE '2024-02-04' GROUP BY order_id
) s ON o.id = s.order_id;
ALTER TABLE warehouse.order_facts ADD PRIMARY KEY (id);
ATTACH 'fulfillment-current.package.json' AS operations (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
ATTACH 'fulfillment-revised.package.json' AS revised (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
