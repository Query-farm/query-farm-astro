# Retail: one definition, different reporting questions

Jaffle Shop is a fictional retailer. This frozen sample contains 525 orders,
834 receipt lines and store, product and customer dimensions. No API, VGI worker
or external database is required.

## Run

Extract the archive and change into the `retail/` directory. Start a fresh
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

The three queries in `run.sql` correspond, in order, to `expected/by-store.csv`,
`expected/totals.csv` and `expected/revisions.csv`. Revenue is in USD. Revision 1
includes collected tax; revision 2 excludes it. Both packages bind to the same
physical rows. Orders and receipt lines aggregate independently, so an order's
revenue is not multiplied by its line count.

`setup.sql` already includes the statements in `attach.sql`; do not execute
`attach.sql` again. Readable source definitions are under `models/`; attachment
uses the packaged copies. `reject.sql` is an optional deliberate failure and is
excluded from the successful batch run.

Data attribution, license, generator pin and snapshot hashes are retained in
`data/NOTICE`, `data/LICENSE` and `data/snapshot.json`. The complete frozen CSV
set includes `supplies.csv`, which this model does not query. Only generated data
is reused from Jaffle's generator; semantic models and numerical expectations
are independently authored in Crossfield.

Expected CSV files are independently specified answers, not captured transcripts.
The included model JSON is copied without semantic changes from the maintained
Crossfield fixtures. `provenance.json` records source files, hashes and the source
checkout revision. Packaging does not execute SQL or establish a new test pass.

To inspect the compilation, run `.read explain.sql` after setup. This invokes
`EXPLAIN (SEMANTIC)`; it does not execute a provider.
