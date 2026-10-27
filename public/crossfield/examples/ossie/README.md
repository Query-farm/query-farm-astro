# Ossie: dataset-scoped metric definitions

Two datasets each define a metric named revenue. Their canonical metric names
remain distinct, and each recipe resolves fields in its own dataset.

## Run

Extract the archive and change into the `ossie/` directory. Start a fresh
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

`expected/results.csv` contains sales **84** and refunds **7**. The orders
dataset defines logical amount as `raw_amount * 2`, so its revenue is
`2 × (10 + 20 + 5 + 7) = 84`; SQL SUM ignores the one NULL. Returns use their
own amount definition, giving `3 + 4 = 7`.

The copied fixture targets the Ossie `0.2.0.dev0` / `OSSIE_SQL_2026` profile.
Its `custom_extensions` entry supplies Crossfield execution approvals. The full
fixture also contains Crossfield root metric composition and window examples;
it is not a claim that every definition is portable to every Ossie consumer.
`FROM SEMANTIC` is Crossfield SQL, not an Ossie-standard query language.

Expected CSV files are independently specified answers, not captured transcripts.
The included model JSON is copied without semantic changes from the maintained
Crossfield fixtures. `provenance.json` records source files, hashes and the source
checkout revision. Packaging does not execute SQL or establish a new test pass.

To inspect the compilation, run `.read explain.sql` after setup. This invokes
`EXPLAIN (SEMANTIC)`; it does not execute a provider.
