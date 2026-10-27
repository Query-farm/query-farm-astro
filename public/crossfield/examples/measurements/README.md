# Measurements: the interval matters at midnight

Four synthetic rows demonstrate native measurement-interval semantics. The
example does not call Open-Meteo, use VGI or claim a new worker integration result.

## Run

Extract the archive and change into the `measurements/` directory. Start a fresh
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

`expected/results.csv` gives three groups. Location A's 5 mm observation is
labelled midnight on January 2, but represents January 1 at 23:00 through
midnight, so it belongs to January 1. On January 2, A's amounts add to 7 mm and
its approved duration-weighted flux mean is `(20 × 1 + 50 × 2) / 3 = 40`.
Location B's 11 mm uses an independent coverage series, despite matching A's
timestamps.

The fixture's flux unit is W/m². The weighted result is still a mean flux, not
energy. Whole-interval assignment neither splits nor prorates measurements.
These sparse rows do not claim complete daily coverage. Instantaneous, event-time
and unknown-support fields coexist without inheriting the interval's meaning.

The matching build must include ICU; `setup.sql` loads it explicitly. This
bounded example uses UTC. The maintained native suite separately covers DST and
fixed offsets. `reject.sql` demonstrates an unapproved temporal aggregation and
is intentionally excluded from the successful batch run. The full fixture
contains deliberately unsafe recipes for rejection tests; their presence is not
an approval to execute them.

Expected CSV files are independently specified answers, not captured transcripts.
The included model JSON is copied without semantic changes from the maintained
Crossfield fixtures. `provenance.json` records source files, hashes and the source
checkout revision. Packaging does not execute SQL or establish a new test pass.

To inspect the compilation, run `.read explain.sql` after setup. This invokes
`EXPLAIN (SEMANTIC)`; it does not execute a provider.
