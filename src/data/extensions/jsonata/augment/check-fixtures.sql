-- Fixtures for the jsonata extension cookbook / technical-details / functions.json
-- examples. Each table has a JSON `payload` column with realistic shape.
-- Idempotent: uses CREATE OR REPLACE.

CREATE OR REPLACE TABLE contacts AS
SELECT * FROM (VALUES
  (
    1,
    '{
      "FirstName": "Fred",
      "Surname": "Smith",
      "Account": {"Name": "Firefly", "Tier": "gold"},
      "Phone": [
        {"type": "home",   "number": "0203 544 1234"},
        {"type": "mobile", "number": "077 7700 1234"}
      ],
      "Orders": [
        {"Quantity": 3, "UnitPrice": 12.50},
        {"Quantity": 1, "UnitPrice": 40.00}
      ]
    }'::JSON
  ),
  (
    2,
    '{
      "FirstName": "Jane",
      "Surname": "Doe",
      "Account": {"Name": "Acme", "Tier": "silver"},
      "Phone": [
        {"type": "home",   "number": "0207 555 0100"},
        {"type": "mobile", "number": "077 1234 5678"}
      ],
      "Orders": [
        {"Quantity": 2, "UnitPrice": 5.00}
      ]
    }'::JSON
  )
) AS t(contact_id, payload);

CREATE OR REPLACE TABLE orders AS
SELECT * FROM (VALUES
  (
    1001,
    '{
      "Order": {
        "Product": [
          {"Description": {"Colour": "red"},   "Price": 10.00, "Quantity": 2},
          {"Description": {"Colour": "blue"},  "Price":  5.50, "Quantity": 4}
        ]
      }
    }'::JSON
  ),
  (
    1002,
    '{
      "Order": {
        "Product": [
          {"Description": {"Colour": "green"}, "Price": 7.25, "Quantity": 1}
        ]
      }
    }'::JSON
  )
) AS t(order_id, payload);

CREATE OR REPLACE TABLE invoices AS
SELECT * FROM (VALUES
  (
    1,
    '{
      "items": [
        {"id": "a", "status": "open",   "amount": 250, "price": 250},
        {"id": "b", "status": "closed", "amount":  90, "price":  90},
        {"id": "c", "status": "open",   "amount":  50, "price":  50}
      ]
    }'::JSON
  )
) AS t(invoice_id, payload);

CREATE OR REPLACE TABLE line_items AS
SELECT * FROM (VALUES
  (
    1,
    '{
      "items": [
        {"id": "x", "price": 150},
        {"id": "y", "price":  80},
        {"id": "z", "price": 200}
      ]
    }'::JSON
  )
) AS t(line_item_id, payload);
