-- Run in a fresh matching DuckDB CLI with Crossfield already loaded.
-- Working directory: the Crossfield source repository root.
-- Independently authored Crossfield fixture, separate from Jaffle Shop.
-- The month dimension in these models requires ICU and UTC.
LOAD icu;
SET TimeZone = 'UTC';

CREATE TABLE shared_join_actuals (
    id INTEGER PRIMARY KEY, region VARCHAR, month DATE,
    segment VARCHAR, amount INTEGER, active BOOLEAN
);
CREATE TABLE shared_join_plans (
    id INTEGER PRIMARY KEY, region VARCHAR, month DATE,
    segment VARCHAR, amount INTEGER, active BOOLEAN
);

INSERT INTO shared_join_actuals VALUES
    (1, 'North', '2026-01-01', 'Retail', 100, true),
    (2, 'North', '2026-01-01', 'Online', 40, true),
    (3, 'North', '2026-02-01', 'Retail', 90, true),
    (4, 'South', '2026-01-01', 'Retail', 80, true),
    (5, 'West', '2026-01-01', 'Online', 25, true),
    (6, NULL, '2026-01-01', 'Retail', 10, true),
    (7, 'North', '2026-01-01', 'Retail', 999, false),
    (8, 'North', '2026-01-01', 'Online', NULL, true);
INSERT INTO shared_join_plans VALUES
    (1, 'North', '2026-01-01', 'Retail', 200, true),
    (2, 'North', '2026-01-01', 'Online', 50, true),
    (3, 'North', '2026-02-01', 'Retail', 300, true),
    (4, 'East', '2026-01-01', 'Retail', 60, true),
    (5, NULL, '2026-01-01', 'Retail', 15, true),
    (6, 'South', '2026-02-01', 'Online', 100, true),
    (7, 'North', '2026-01-01', 'Retail', 900, false);

ATTACH 'test/models/shared-join-actual.ossie.json'
AS actuals (TYPE crossfield);
ATTACH 'test/models/shared-join-plan.ossie.json'
AS planning (TYPE crossfield);
SET crossfield_mode = 'semantic';
