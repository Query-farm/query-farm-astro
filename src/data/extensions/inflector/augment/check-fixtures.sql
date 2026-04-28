-- Fixtures for inflector cookbook / technical-details / functions.json examples.
-- Small, deterministic, idempotent. Backs snippets that read from
-- `api_events` (struct payload), `models` (class names), `mixed_input`
-- (raw case-mixed strings), and `left_records` / `right_records` (dedupe pair).

CREATE OR REPLACE TABLE api_events (
    id       INTEGER,
    payload  STRUCT(firstName TEXT, lastName TEXT)
);
INSERT INTO api_events VALUES
    (1, {'firstName': 'John',  'lastName': 'Doe'}),
    (2, {'firstName': 'Jane',  'lastName': 'Roe'}),
    (3, {'firstName': 'Mary',  'lastName': 'Sue'});

CREATE OR REPLACE TABLE models (
    class_name  TEXT
);
INSERT INTO models VALUES
    ('UserAccount'),
    ('Message'),
    ('Order');

CREATE OR REPLACE TABLE mixed_input (
    raw  TEXT
);
INSERT INTO mixed_input VALUES
    ('helloWorld'),
    ('HelloWorld'),
    ('hello_world'),
    ('hello-world');

CREATE OR REPLACE TABLE left_records (
    id    INTEGER,
    name  TEXT
);
INSERT INTO left_records VALUES
    (1, 'helloWorld'),
    (2, 'fooBar');

CREATE OR REPLACE TABLE right_records (
    id    INTEGER,
    name  TEXT
);
INSERT INTO right_records VALUES
    (10, 'hello_world'),
    (20, 'foo_bar');
