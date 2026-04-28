-- Fixtures for evalexpr_rhai cookbook / technical-details / functions.json examples.
-- Small, deterministic, idempotent. Tables created here back the snippets that
-- read from `employees`, `orders`, and `jobs`. `group_membership` and
-- `eligibility` are intentionally NOT created here because the cookbook /
-- technical-details snippets `CREATE TABLE` them inline.

CREATE TABLE IF NOT EXISTS employees (
    id      INTEGER,
    name    TEXT,
    salary  INTEGER,
    years   INTEGER,
    title   TEXT
);
INSERT INTO employees
SELECT * FROM (VALUES
    (1, 'Rusty',  150000, 7, 'Engineering Lead'),
    (2, 'George', 120000, 6, 'Lead Engineer'),
    (3, 'John',    95000, 4, 'Shift Lead'),
    (4, 'Alex',    72000, 2, 'Engineer')
) AS v(id, name, salary, years, title)
WHERE NOT EXISTS (SELECT 1 FROM employees);

CREATE TABLE IF NOT EXISTS orders (
    id     INTEGER,
    qty    INTEGER,
    price  DOUBLE,
    tier   TEXT
);
INSERT INTO orders
SELECT * FROM (VALUES
    (1, 2,  9.99,  'gold'),
    (2, 5, 19.50,  'silver'),
    (3, 1, 49.00,  'bronze'),
    (4, 3, 12.25,  'gold')
) AS v(id, qty, price, tier)
WHERE NOT EXISTS (SELECT 1 FROM orders);

CREATE TABLE IF NOT EXISTS jobs (
    id    INTEGER,
    rule  TEXT,
    x     INTEGER
);
INSERT INTO jobs
SELECT * FROM (VALUES
    (1, 'context.x * 2',     5),
    (2, 'context.x + 10',    7),
    (3, '1 / 0',             0),
    (4, 'context.x > 0',     3)
) AS v(id, rule, x)
WHERE NOT EXISTS (SELECT 1 FROM jobs);
