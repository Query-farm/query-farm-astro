-- Fixtures for the lindel cookbook + technical-details + functions.json
-- examples. Small, deterministic, idempotent — re-running is a no-op.

-- A generic source table with every column the docs reach for: spatial
-- (lat, lon, alt), temporal (time as epoch seconds), and a categorical
-- id (symbol_id) for the Morton time-series example.
CREATE OR REPLACE TABLE source AS
SELECT
    (40 + (i % 10) * 0.1)::DOUBLE       AS lat,
    (-74 + (i % 10) * 0.1)::DOUBLE      AS lon,
    (100 + i)::INTEGER                  AS alt,
    (1700000000 + i * 60)::INTEGER      AS time,
    (i % 8)::INTEGER                    AS symbol_id
FROM range(0, 16) t(i);

-- Flight history fixture: same schema shape as the cookbook 4D example.
CREATE OR REPLACE TABLE flights AS
SELECT
    (30 + (i % 12))::INTEGER            AS lat,
    (-100 + (i % 12))::INTEGER          AS lon,
    (10000 + i * 100)::INTEGER          AS alt,
    (1700000000 + i * 60)::INTEGER      AS time
FROM range(0, 16) t(i);

-- 3D points fixture used by technical-details.
CREATE OR REPLACE TABLE points AS
SELECT
    (i % 8)::INTEGER                    AS x,
    ((i * 3) % 8)::INTEGER              AS y,
    ((i * 5) % 8)::INTEGER              AS z
FROM range(0, 16) t(i);
