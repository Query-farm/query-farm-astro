SET crossfield_mode = 'strict';
-- Result 1: expected/direct.csv. Required input can be positional.
SELECT number_count, number_sum
FROM SEMANTIC arithmetic.numbers(5);

-- Result 2: expected/named.csv. Equivalent named call.
SELECT number_count, number_sum
FROM SEMANTIC arithmetic.numbers(stop => 5);

-- Result 3: expected/pipeline.csv. The model owns the retrieval dependency.
SELECT number_count, number_sum
FROM SEMANTIC arithmetic.numbers(seed => 4);
