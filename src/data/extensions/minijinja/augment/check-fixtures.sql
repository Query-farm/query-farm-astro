-- Fixtures for minijinja cookbook / technical-details examples.
-- Small, deterministic, idempotent (CREATE OR REPLACE).

-- "Generate HTML email per row" (cookbook) and "What you can do with one
-- query" (technical-details).
CREATE OR REPLACE TABLE users (
    email         TEXT,
    name          TEXT,
    unread_count  INTEGER
);
INSERT INTO users VALUES
    ('alice@example.com', 'Alice', 3),
    ('bob@example.com',   'Bob',   0),
    ('carol@example.com', 'Carol', 12);

-- "Generate config files / IaC" (cookbook).
CREATE OR REPLACE TABLE virtual_hosts (
    hostname  TEXT,
    upstream  TEXT
);
INSERT INTO virtual_hosts VALUES
    ('app.example.com', '10.0.0.10:8080'),
    ('api.example.com', '10.0.0.20:9000');
