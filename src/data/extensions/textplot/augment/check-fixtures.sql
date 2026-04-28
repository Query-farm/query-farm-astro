-- Fixtures for textplot extension SQL examples.
-- Provides small, deterministic data so the validator can parse and
-- execute the snippets in cookbook.mdx, technical-details.mdx, and
-- metadata.json that reference real tables.

-- A numeric column with a roughly normal-looking distribution. Built
-- deterministically from generate_series + a sum of trig terms so the
-- spread is realistic (a single hump centred near zero with tails) and
-- the same numbers come out every run. Used by the `tp_density(...)`
-- "see the shape of a column" examples.
CREATE OR REPLACE TABLE measurements AS
SELECT (
         sin(i * 0.13)
       + sin(i * 0.29 + 1.7)
       + sin(i * 0.71 + 0.4)
       + sin(i * 1.13 + 2.1)
       )::DOUBLE AS value
FROM range(0, 200) t(i);

-- A handful of hosts each with a 24-point CPU history array and a
-- disk-utilization percentage. Used by the `tp_sparkline(cpu_history)`
-- and `tp_bar(disk_pct, ...)` per-row examples.
CREATE OR REPLACE TABLE hosts_status AS
SELECT
    'host-' || lpad(h::VARCHAR, 2, '0') AS host,
    [
      40 + 20 * sin(h * 0.5 + 0.0) + 5 * sin(h * 1.7 + 0.1),
      40 + 20 * sin(h * 0.5 + 0.3) + 5 * sin(h * 1.7 + 0.4),
      40 + 20 * sin(h * 0.5 + 0.6) + 5 * sin(h * 1.7 + 0.7),
      40 + 20 * sin(h * 0.5 + 0.9) + 5 * sin(h * 1.7 + 1.0),
      40 + 20 * sin(h * 0.5 + 1.2) + 5 * sin(h * 1.7 + 1.3),
      40 + 20 * sin(h * 0.5 + 1.5) + 5 * sin(h * 1.7 + 1.6),
      40 + 20 * sin(h * 0.5 + 1.8) + 5 * sin(h * 1.7 + 1.9),
      40 + 20 * sin(h * 0.5 + 2.1) + 5 * sin(h * 1.7 + 2.2),
      40 + 20 * sin(h * 0.5 + 2.4) + 5 * sin(h * 1.7 + 2.5),
      40 + 20 * sin(h * 0.5 + 2.7) + 5 * sin(h * 1.7 + 2.8),
      40 + 20 * sin(h * 0.5 + 3.0) + 5 * sin(h * 1.7 + 3.1),
      40 + 20 * sin(h * 0.5 + 3.3) + 5 * sin(h * 1.7 + 3.4),
      40 + 20 * sin(h * 0.5 + 3.6) + 5 * sin(h * 1.7 + 3.7),
      40 + 20 * sin(h * 0.5 + 3.9) + 5 * sin(h * 1.7 + 4.0),
      40 + 20 * sin(h * 0.5 + 4.2) + 5 * sin(h * 1.7 + 4.3),
      40 + 20 * sin(h * 0.5 + 4.5) + 5 * sin(h * 1.7 + 4.6),
      40 + 20 * sin(h * 0.5 + 4.8) + 5 * sin(h * 1.7 + 4.9),
      40 + 20 * sin(h * 0.5 + 5.1) + 5 * sin(h * 1.7 + 5.2),
      40 + 20 * sin(h * 0.5 + 5.4) + 5 * sin(h * 1.7 + 5.5),
      40 + 20 * sin(h * 0.5 + 5.7) + 5 * sin(h * 1.7 + 5.8),
      40 + 20 * sin(h * 0.5 + 6.0) + 5 * sin(h * 1.7 + 6.1),
      40 + 20 * sin(h * 0.5 + 6.3) + 5 * sin(h * 1.7 + 6.4),
      40 + 20 * sin(h * 0.5 + 6.6) + 5 * sin(h * 1.7 + 6.7),
      40 + 20 * sin(h * 0.5 + 6.9) + 5 * sin(h * 1.7 + 7.0)
    ]::DOUBLE[] AS cpu_history,
    -- Spread disk_pct across 10..98 so the threshold-coloured bar
    -- example exercises the green / yellow / red zones.
    (10 + (h * 13) % 89)::DOUBLE AS disk_pct
FROM range(0, 8) t(h);
