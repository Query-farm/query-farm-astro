-- Fixtures for quickjs cookbook / technical-details / functions.json examples.
-- Small, deterministic, idempotent. Backs snippets that read from `events`
-- (raw event rows with a JSON `payload` column) and `transformed_events`
-- (the result-shaped table that holds an `extracted` JSON column).

CREATE OR REPLACE TABLE events (
    id          INTEGER,
    event_type  TEXT,
    payload     TEXT
);
INSERT INTO events VALUES
    (1, 'login',    '{"event":"login","user":"alice","meta":{"device":"phone","os":"ios"}}'),
    (2, 'purchase', '{"event":"purchase","user":"bob","amount":42.50,"meta":{"item":"book","os":"android","currency":"USD"}}'),
    (3, 'login',    '{"event":"login","user":"carol","meta":{"device":"laptop","os":"linux"}}');

CREATE OR REPLACE TABLE transformed_events (
    id         INTEGER,
    extracted  JSON
);
INSERT INTO transformed_events VALUES
    (1, '{"user":"alice","os":"ios"}'),
    (2, '{"user":"bob","os":"android"}');
