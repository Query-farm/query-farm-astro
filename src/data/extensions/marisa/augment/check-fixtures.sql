-- Fixtures for marisa example snippets. Idempotent: uses CREATE OR REPLACE.

-- Source: cookbook.mdx "Build a trie"
CREATE OR REPLACE TABLE employees(name TEXT);
INSERT INTO employees VALUES
  ('Alice'),('Bob'),('Charlie'),('David'),('Eve'),('Frank'),
  ('Mallory'),('Megan'),('Oscar'),('Melissa');

-- Trie built from employees, referenced by lookup/predictive examples.
CREATE OR REPLACE TABLE employees_trie AS
  SELECT marisa_trie(name) AS trie FROM employees;

-- Source: cookbook.mdx "Longest-prefix match"
CREATE OR REPLACE TABLE country_codes(code TEXT);
INSERT INTO country_codes VALUES ('U'), ('US'), ('USA');

CREATE OR REPLACE TABLE country_codes_trie AS
  SELECT marisa_trie(code) AS trie FROM country_codes;

-- Stand-in for the /usr/share/dict/words wordlist used by the
-- "Big static dictionary" cookbook section. Small, deterministic
-- set with shared "duck" prefixes so marisa_predictive(..., 'duck', ...)
-- still returns plausible completions.
CREATE OR REPLACE TABLE words(word TEXT);
INSERT INTO words VALUES
  ('duck'), ('duckbill'), ('duckboard'), ('ducker'), ('ducking'),
  ('duckling'), ('ducks'), ('ducky'),
  ('rouge'), ('rough'), ('round'), ('route'), ('routine'),
  ('apple'), ('banana'), ('cherry');

CREATE OR REPLACE TABLE words_trie AS
  SELECT marisa_trie(word) AS trie FROM words;

-- "dictionary" alias used by technical-details.mdx "What you can do with one query".
CREATE OR REPLACE TABLE dictionary(word TEXT);
INSERT INTO dictionary SELECT word FROM words;

-- Source: cookbook.mdx "One trie per partition / tenant"
CREATE OR REPLACE TABLE signups(day DATE, name TEXT);
INSERT INTO signups VALUES
  (DATE '2024-01-01', 'Alice'),
  (DATE '2024-01-01', 'Megan'),
  (DATE '2024-01-02', 'Bob'),
  (DATE '2024-01-02', 'Melissa'),
  (DATE '2024-01-03', 'Charlie');

CREATE OR REPLACE TABLE name_tries AS
SELECT day,
       marisa_trie(name) AS trie
FROM signups
GROUP BY day;
