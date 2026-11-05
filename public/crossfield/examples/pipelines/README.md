# Typed inputs and model-owned retrieval

This native fixture uses DuckDB range functions, with no API credentials,
network service or VGI worker. All entry points reuse one canonical numbers
dataset and the same count/sum definitions.

## Run

Extract the archive and change into the `pipelines/` directory. Start a fresh
connection using the matching Query Farm DuckDB build and Crossfield extension:

```sh
/path/to/matched/duckdb -unsigned -cmd "LOAD '/absolute/path/to/crossfield.duckdb_extension';"
```

Then run:

```sql
.bail on
.read setup.sql
.read run.sql
```

The paths in these files are relative to this directory. `setup.sql` creates
source objects and attaches the model; run it once in a fresh connection.
`run.sql` selects the mode explicitly. You can also redirect `session.sql` into
the same CLI command for a batch run.

This is not a stock DuckDB extension-installation example. The required engine
base is `d54cbbe3df17e8e5ce68312f483b4155836112aa`, plus Crossfield's eight maintained DuckDB
patches, and the extension must match that engine and platform. The bundle does
not include binaries. Use the matching artifacts supplied for your evaluation;
`INSTALL crossfield` against stock DuckDB is not a supported substitute.

## Expected results and scope

The three queries correspond to `expected/direct.csv`, `expected/named.csv`
and `expected/pipeline.csv`. The direct call produces 0, 1, 2, 3, 4: count **5**,
sum **10**. The equivalent named call has the same answer.

The `seed => 4` signature first generates candidates 0, 1, 2, 3. Its model-owned
filter excludes zero, then calls an approved one-element range for each remaining
candidate. The final rows are 1, 2, 3: count **3**, sum **6**. The caller supplies
a scope input without writing an invocation document or a lateral join.

`stop` accepts a required positional-or-named BIGINT. `seed` is a required
keyword-only BIGINT and selects a different declared signature. The engine does
not infer scope from a string's contents or choose a provider by trying it.
The full fixture includes additional signatures used by native regression tests;
these three calls are the bounded website demonstration.

Expected CSV files are independently specified answers, not captured transcripts.
The included model JSON is copied without semantic changes from the maintained
Crossfield fixtures. `provenance.json` records source files, hashes and the source
checkout revision. Packaging does not execute SQL or establish a new test pass.

To inspect the compilation, run `.read explain.sql` after setup. This invokes
`EXPLAIN (SEMANTIC)`; it does not execute a provider.
