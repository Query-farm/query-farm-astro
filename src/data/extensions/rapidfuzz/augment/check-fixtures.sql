-- Fixtures for rapidfuzz cookbook / technical-details / quickStart snippets.
-- Small, deterministic, idempotent. Tables seeded with a few near-duplicates
-- so blocking, dedupe, top-1, and spell-check recipes return non-empty results.

CREATE OR REPLACE TABLE customers (
    id      INTEGER,
    name    VARCHAR,
    address VARCHAR
);
INSERT INTO customers VALUES
    (1, 'Acme Corporation',       '123 Main Street'),
    (2, 'ACME Corp.',              '123 Main St'),
    (3, 'Acme Corp',               '123 Main St.'),
    (4, 'Globex Industries',       '500 Innovation Way'),
    (5, 'Globex Industires',       '500 Innovation Way'),
    (6, 'Initech',                 '742 Evergreen Terrace'),
    (7, 'Initech LLC',             '742 Evergreen Ter.'),
    (8, 'Soylent Green Foods',     '1 Future Plaza'),
    (9, 'Soylent Green Foods Inc', '1 Future Plaza Suite 2');

CREATE OR REPLACE TABLE left_records (
    id   INTEGER,
    name VARCHAR
);
INSERT INTO left_records VALUES
    (1, 'Jonathan Smith'),
    (2, 'Catherine Jones'),
    (3, 'Robert Williams'),
    (4, 'Elizabeth Brown');

CREATE OR REPLACE TABLE right_records (
    id   INTEGER,
    name VARCHAR
);
INSERT INTO right_records VALUES
    (10, 'Jonathon Smith'),
    (11, 'Catharine Jones'),
    (12, 'Robert Willams'),
    (13, 'Elisabeth Browne'),
    (14, 'Michael Davis');

CREATE OR REPLACE TABLE titles (
    id    INTEGER,
    title VARCHAR
);
INSERT INTO titles VALUES
    (1, 'The Quick Brown Fox'),
    (2, 'Quick Brown Fox The'),
    (3, 'the quick brown fox jumps'),
    (4, 'Lazy Dog Sleeping'),
    (5, 'Sleeping Lazy Dog'),
    (6, 'Hello World Example'),
    (7, 'Example Hello World');

CREATE OR REPLACE TABLE dictionary (
    word VARCHAR
);
INSERT INTO dictionary VALUES
    ('apple'), ('apply'), ('ample'), ('amplify'),
    ('banana'), ('bandana'), ('bandage'),
    ('orange'), ('arrange'), ('range'),
    ('grape'), ('grade'), ('great');
