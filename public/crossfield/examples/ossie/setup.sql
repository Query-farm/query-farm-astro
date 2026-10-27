CREATE TABLE scoped_orders(
    source_id INTEGER PRIMARY KEY, raw_amount INTEGER, region VARCHAR, status VARCHAR
);
INSERT INTO scoped_orders VALUES
    (1,10,'N','paid'), (2,20,'N','unpaid'), (3,NULL,'N','paid'),
    (4,5,'S','unpaid'), (5,7,'E',NULL);
CREATE TABLE scoped_returns(
    source_id INTEGER PRIMARY KEY, raw_amount INTEGER, region VARCHAR
);
INSERT INTO scoped_returns VALUES (1,3,'N'), (2,4,'S');
ATTACH 'model.ossie.json' AS local_metrics (TYPE crossfield);
