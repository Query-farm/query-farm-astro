CREATE OR REPLACE TABLE customers(id INTEGER, name VARCHAR);
INSERT INTO customers VALUES (1,'Ada'), (2,'Ben'), (3,'Cy'), (4,'Dee');
CREATE OR REPLACE TABLE orders(id INTEGER, customer_id INTEGER);
INSERT INTO orders VALUES (101,1), (102,1), (103,NULL), (104,3);
