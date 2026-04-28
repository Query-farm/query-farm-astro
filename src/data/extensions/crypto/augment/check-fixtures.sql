-- Fixtures for the crypto extension cookbook / technical-details snippets.
-- Small deterministic data; safe to re-run within a single fresh session.

-- HMAC bind variable for `:secret` in the cookbook.
SET VARIABLE secret = 'shared-hmac-key';

CREATE OR REPLACE TABLE users (
    id      INTEGER,
    email   VARCHAR
);
INSERT INTO users VALUES
    (1, 'alice@example.com'),
    (2, 'bob@example.com'),
    (3, 'carol@example.com');

CREATE OR REPLACE TABLE events (
    day      DATE,
    id       INTEGER,
    payload  VARCHAR
);
INSERT INTO events VALUES
    (DATE '2026-01-01', 1, 'login'),
    (DATE '2026-01-01', 2, 'click'),
    (DATE '2026-01-02', 3, 'purchase'),
    (DATE '2026-01-02', 4, 'logout');

CREATE OR REPLACE TABLE audit_log (
    id          INTEGER,
    action      VARCHAR,
    user_id     INTEGER,
    created_at  TIMESTAMP,
    hash        BLOB
);
INSERT INTO audit_log VALUES
    (1, 'create', 1, TIMESTAMP '2026-01-01 09:00:00', NULL),
    (2, 'update', 1, TIMESTAMP '2026-01-01 09:05:00', NULL),
    (3, 'delete', 2, TIMESTAMP '2026-01-01 10:00:00', NULL);

CREATE OR REPLACE TABLE raw_purchases (
    customer_email  VARCHAR,
    product_sku     VARCHAR,
    purchase_date   DATE
);
INSERT INTO raw_purchases VALUES
    ('alice@example.com', 'SKU-001', DATE '2026-01-01'),
    ('bob@example.com',   'SKU-002', DATE '2026-01-02'),
    ('carol@example.com', 'SKU-001', DATE '2026-01-03');

CREATE OR REPLACE TABLE api_requests (
    id            INTEGER,
    request_body  VARCHAR
);
INSERT INTO api_requests VALUES
    (1, '{"op":"ping"}'),
    (2, '{"op":"create","id":42}'),
    (3, '{"op":"delete","id":7}');

CREATE OR REPLACE TABLE employees (
    employee_id  INTEGER,
    department   VARCHAR
);
INSERT INTO employees VALUES
    (1, 'engineering'),
    (2, 'engineering'),
    (3, 'sales'),
    (4, 'sales'),
    (5, 'support');
