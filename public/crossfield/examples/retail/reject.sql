-- Deliberate rejection: raw tables are outside strict semantic queries.
-- Expected: strict-mode rejection of this unapproved raw-source query.
SET crossfield_mode = 'strict';
SELECT SUM(total) FROM warehouse.orders;
