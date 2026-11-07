CREATE OR REPLACE TABLE incoming(id INTEGER, payload JSON);
INSERT INTO incoming VALUES
  (101, '{"customer":"Ada","items":[{"sku":"MUG","qty":2},{"sku":"TEA","qty":1}]}'),
  (102, '{"customer":"Ben","items":[]}'),
  (103, '{"customer":"Cy","items":[{"sku":"MUG","qty":1}]}');
CREATE OR REPLACE VIEW orders AS
SELECT id, json_transform(payload,
  '{"customer":"VARCHAR","items":[{"sku":"VARCHAR","qty":"INTEGER"}]}') AS order_data
FROM incoming;
