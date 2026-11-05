// Match real, rendered documentation examples. Do not replace their SQL with
// a constant SELECT: the expected result must exercise the extension itself.
// Rows include terminal table borders so echoed SQL cannot satisfy the check.
export const examples: Record<string, { sql: RegExp; result: RegExp }> = {
  a5: { sql: /^SELECT a5_get_resolution\(a5_lonlat_to_cell\(-122\.4, 37\.8, 10\)\);$/, result: /│\s*10\s*│/ },
  bitfilters: { sql: /^SELECT bitfilters_duckdb_hash\('v2\.0', 42\);$/, result: /│\s*\d+\s*│/ },
  datasketches: { sql: /^SELECT datasketch_hll_estimate\(datasketch_hll\(12, user_id\)\) AS distinct_users\s+FROM events;$/, result: /│\s*30(?:\.0\d*)?\s*│/ },
  evalexpr_rhai: { sql: /^SELECT evalexpr_rhai\('5 \+ 6'\)\.ok;$/, result: /│\s*11\s*│/ },
  geosilo: { sql: /^SELECT ST_AsText\(\s*geosilo_decode\(geosilo_encode\(ST_GeomFromText\('POLYGON/, result: /│\s*POLYGON\s*\(\(0 0, 10 0, 10 10, 0 10, 0 0\)\)\s*│/ },
  grainlift: { sql: /Calculate units sold and revenue for each product/, result: /│\s*House blend\s*│/ },
  hashfuncs: { sql: /^SELECT xxh3_128_hex\('hello'\) AS digest;$/, result: /│\s*b5e9c1ad071b3e7fc779cfaa5e523818\s*│/ },
  inflector: { sql: /^SELECT inflector_to_camel_case\('hello_world'\);/, result: /│\s*helloWorld\s*│/ },
  json_schema: { sql: /^SELECT json_schema_validate_schema\('\{/, result: /│\s*true\s*│/ },
  jsonata: { sql: /^SELECT jsonata\('Account.Name',/, result: /│\s*"?Firefly"?\s*│/ },
  lindel: { sql: /SELECT hilbert_encode\(\[10, 20\]::UINTEGER\[2\]\) AS hilbert;/, result: /│\s*884\s*│/ },
  marisa: { sql: /^SELECT marisa_lookup\(trie, 'Alice'\) FROM employees_trie;$/, result: /│\s*true\s*│/ },
  minijinja: { sql: /^SELECT minijinja_render_with_context\('Hello \{\{ name \}\}!'/, result: /│\s*Hello World!\s*│/ },
  quickjs: { sql: /^SELECT quickjs\('2 \+ 2'\);$/, result: /│\s*4\s*│/ },
  rapidfuzz: { sql: /^SELECT rapidfuzz_token_sort_ratio\('world hello', 'hello world'\);/, result: /│\s*100(?:\.0)?\s*│/ },
  stochastic: { sql: /^SELECT round\(dist_normal_quantile\(0\.0, 1\.0, 0\.95\), 4\) AS p95,/, result: /│\s*1\.6449\s*│/ },
  tera: { sql: /^SELECT tera_render\('Hello \{\{ name \}\}!'/, result: /│\s*Hello World!\s*│/ },
  textplot: { sql: /^SELECT tp_bar\(0\.5\);$/, result: /🟥🟥🟥🟥🟥⬜⬜⬜⬜⬜/ },
  // This extension documents 32 hex characters, not the JVM TSID encoding.
  tsid: { sql: /^SELECT tsid\(\);$/, result: /│\s*[0-9a-f]{32}\s*│/ },
  vgi: { sql: /^SELECT \* FROM vgi_oauth_tokens\(\);$/, result: /0 rows/ },
};
