-- Run from the extracted retail directory in a fresh DuckDB connection.
-- Frozen synthetic CSV provenance: data/NOTICE.
-- This physical setup runs before strict semantic mode is enabled.
ATTACH ':memory:' AS warehouse;

CREATE TABLE warehouse.orders (
    id VARCHAR PRIMARY KEY, customer_id VARCHAR NOT NULL,
    store_id VARCHAR NOT NULL, ordered_at TIMESTAMP NOT NULL,
    subtotal DECIMAL(18,2), tax DECIMAL(18,2), total DECIMAL(18,2),
    is_first BOOLEAN NOT NULL
);
INSERT INTO warehouse.orders
SELECT id, customer, store_id, ordered_at::TIMESTAMP,
       (subtotal::BIGINT * 0.01)::DECIMAL(18,2),
       (tax_paid::BIGINT * 0.01)::DECIMAL(18,2),
       (order_total::BIGINT * 0.01)::DECIMAL(18,2),
       row_number() OVER (PARTITION BY customer ORDER BY ordered_at::TIMESTAMP, id) = 1
FROM read_csv('data/orders.csv', header=true, all_varchar=true);

CREATE TABLE warehouse.items (id VARCHAR PRIMARY KEY, order_id VARCHAR NOT NULL, sku VARCHAR NOT NULL);
INSERT INTO warehouse.items
SELECT id, order_id, sku
FROM read_csv('data/items.csv', header=true, all_varchar=true);

CREATE TABLE warehouse.products (sku VARCHAR PRIMARY KEY, name VARCHAR, category VARCHAR, price DECIMAL(18,2));
INSERT INTO warehouse.products
SELECT sku, name, type, (price::BIGINT * 0.01)::DECIMAL(18,2)
FROM read_csv('data/products.csv', header=true, all_varchar=true);

CREATE TABLE warehouse.stores (id VARCHAR PRIMARY KEY, name VARCHAR);
INSERT INTO warehouse.stores
SELECT id, name FROM read_csv('data/stores.csv', header=true, all_varchar=true);

CREATE TABLE warehouse.customers (id VARCHAR PRIMARY KEY, name VARCHAR);
INSERT INTO warehouse.customers
SELECT id, name FROM read_csv('data/customers.csv', header=true, all_varchar=true);

-- Both revisions use the same physical rows. Changing aliases does not change
-- logical dataset/provider identities. Dependencies must already exist.
ATTACH 'jaffle-v1.package.json' AS jaffle_old (
    TYPE crossfield, MODEL_VERSION '1',
    BINDINGS '{"sales":"warehouse","reference":"warehouse"}'
);
ATTACH 'jaffle-v2.package.json' AS jaffle_current (
    TYPE crossfield, MODEL_VERSION '2',
    BINDINGS '{"sales":"warehouse","reference":"warehouse"}'
);
