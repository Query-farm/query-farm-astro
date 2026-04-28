-- Fixtures for tera cookbook / technical-details / functions.json examples.
-- Small, deterministic, idempotent. Backs snippets that read from `users`
-- (per-row HTML email) and `virtual_hosts` (per-host config).

CREATE OR REPLACE TABLE users (
    email         TEXT,
    name          TEXT,
    unread_count  INTEGER
);
INSERT INTO users VALUES
    ('alice@example.com', 'Alice',   5),
    ('bob@example.com',   'Bob',     0),
    ('carol@example.com', 'Carol',   2);

CREATE OR REPLACE TABLE virtual_hosts (
    hostname  TEXT,
    upstream  TEXT
);
INSERT INTO virtual_hosts VALUES
    ('a.example.com', '10.0.0.1:8080'),
    ('b.example.com', '10.0.0.2:8080'),
    ('c.example.com', '10.0.0.3:8080');
