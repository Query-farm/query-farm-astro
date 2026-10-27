-- Synthetic cash equities. Market values already valued in USD, no FX or pricing model.
ATTACH ':memory:' AS warehouse;
CREATE TABLE warehouse.positions(id INTEGER PRIMARY KEY, as_of DATE, book VARCHAR, issuer VARCHAR, market_value_usd DECIMAL(18,2));
INSERT INTO warehouse.positions VALUES
 (1, '2024-01-31', 'Book A', 'Atlas', 12000000),
 (2, '2024-01-31', 'Book B', 'Atlas', -8000000),
 (3, '2024-01-31', 'Book A', 'Boreal', 3000000),
 (4, '2024-01-31', 'Expansion', 'Atlas', 5000000),
 (5, '2024-01-30', 'Book A', 'Atlas', 300000000);
CREATE TABLE warehouse.issuer_limits(id INTEGER PRIMARY KEY, issuer VARCHAR, as_of DATE, limit_usd DECIMAL(18,2));
INSERT INTO warehouse.issuer_limits VALUES (1, 'Atlas', '2024-01-31', 22000000);
CREATE TABLE warehouse.fills(id INTEGER PRIMARY KEY, order_id VARCHAR, shares INTEGER, price DECIMAL(18,2), status VARCHAR);
INSERT INTO warehouse.fills VALUES (1, 'ORD-101', 100, 100, 'active'), (2, 'ORD-101', 900, 102, 'active'), (3, 'ORD-101', 100, 999, 'void');
ATTACH 'exposure-current.package.json' AS portfolio (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
ATTACH 'exposure-proposed.package.json' AS proposed (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
ATTACH 'limits.crossfield.json' AS risk (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
ATTACH 'executions.crossfield.json' AS trading (TYPE crossfield, BINDINGS '{"warehouse":"warehouse"}');
