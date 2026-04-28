-- Fixtures for events cookbook examples that reference an `orders`
-- table during query_begin / query_end / transaction lifecycle demos.
CREATE TABLE IF NOT EXISTS orders (
  id    INTEGER,
  item  VARCHAR,
  price DOUBLE
);
