// Match real, rendered documentation examples. Do not replace their SQL with
// a constant SELECT: the expected result must exercise the extension itself.
// Rows include terminal table borders so echoed SQL cannot satisfy the check.
export const examples: Record<string, { sql: RegExp; result: RegExp }> = {
  // Core SQL runs without an extension; the article seeds local orders.
  duckdb: { sql: /^SELECT region, sum\(amount\) AS total\s+FROM orders/, result: /│\s*East\s*│\s*102,?000\s*│/ },
  a5: { sql: /^SELECT a5_get_resolution\(a5_lonlat_to_cell\(-122\.4, 37\.8, 10\)\);$/, result: /│\s*10\s*│/ },
  bitfilters: { sql: /^SELECT bitfilters_duckdb_hash\('v2\.0', 42\);$/, result: /│\s*\d+\s*│/ },
  datasketches: { sql: /datasketch_hll\(12, user_id\) AS sketch/, result: /│\s*3(?:\.0\d*)?\s*│/ },
  evalexpr_rhai: { sql: /evalexpr_rhai\('context\.salary >/, result: /│\s*Theo\s*│\s*true\s*│/ },
  geosilo: { sql: /^SELECT ST_AsText\(\s*geosilo_decode\(geosilo_encode\(ST_GeomFromText\('POLYGON/, result: /│\s*POLYGON\s*\(\(0 0, 10 0, 10 10, 0 10, 0 0\)\)\s*│/ },
  grainlift: { sql: /Calculate units sold and revenue for each product/, result: /│\s*House blend\s*│/ },
  hashfuncs: { sql: /xxh3_64\(user_id, 42\) % 4 AS partition_id/, result: /│\s*carol\s*│\s*3\s*│/ },
  inflector: { sql: /^SELECT inflector_to_camel_case\('hello_world'\);/, result: /│\s*helloWorld\s*│/ },
  json_schema: { sql: /^SELECT json_schema_validate_schema\('\{/, result: /│\s*true\s*│/ },
  jsonata: { sql: /^SELECT jsonata\('Account.Name',/, result: /│\s*"?Firefly"?\s*│/ },
  lindel: { sql: /hilbert_encode\(\[x, y\]::UINTEGER\[2\]\) AS hilbert/, result: /│\s*7\s*│\s*0\s*│\s*21\s*│/ },
  marisa: { sql: /marisa_trie\(name\) AS trie/, result: /│[^│\n]*Megan[^│\n]*Melissa[^│\n]*│/ },
  minijinja: { sql: /Items: \{\{ items \| join/, result: /│\s*Hello Mina! Items: tea, coffee\s*│/ },
  quickjs: { sql: /^SELECT quickjs\('2 \+ 2'\);$/, result: /│\s*4\s*│/ },
  rapidfuzz: { sql: /VALUES \(1, 'Jon Smith'\)/, result: /│\s*Jon Smith\s*│\s*John Smith\s*│\s*94\.7\d*\s*│/ },
  stochastic: { sql: /SELECT round\(dist_normal_quantile\(0\.0, 1\.0, 0\.95\), 4\) AS p95,/, result: /│\s*1\.6449\s*│/ },
  tera: { sql: /tera_render\('Hello \{\{ name \}\}!'/, result: /│\s*Hello Mina!\s*│/ },
  textplot: { sql: /^SELECT tp_bar\(0\.5\);$/, result: /🟥🟥🟥🟥🟥⬜⬜⬜⬜⬜/ },
  // This extension documents 32 hex characters, not the JVM TSID encoding.
  tsid: { sql: /^SELECT tsid\(\);$/, result: /│\s*[0-9a-f]{32}\s*│/ },
  vgi: { sql: /^SELECT \* FROM vgi_oauth_tokens\(\);$/, result: /0 rows/ },
};
