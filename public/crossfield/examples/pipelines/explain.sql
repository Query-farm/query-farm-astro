SET crossfield_mode = 'strict';
EXPLAIN (SEMANTIC)
SELECT number_count, number_sum
FROM SEMANTIC arithmetic.numbers(seed => 4);
