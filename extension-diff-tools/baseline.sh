#!/bin/sh

# This is to be run in an extension's git repository root.
#
# It will use the baseline duckdb build in ./duckdb/build/release/duckdb
# to generate baseline data for the given extension.
#
# Then it will use the debug build in ./build/debug/duckdb
# to calculate the contents of the extension by diffing the metadata tables.
#

set -e

BASELINE_DUCKDB="./duckdb/build/release/duckdb"
DEBUG_DUCKDB="./build/debug/duckdb"

# Check that required DuckDB binaries exist
if [ ! -f "$BASELINE_DUCKDB" ]; then
  echo "Error: Baseline DuckDB binary not found at $BASELINE_DUCKDB" >&2
  echo "Please build DuckDB first: cd duckdb && make release" >&2
  exit 1
fi

if [ ! -x "$BASELINE_DUCKDB" ]; then
  echo "Error: Baseline DuckDB binary at $BASELINE_DUCKDB is not executable" >&2
  exit 1
fi

if [ ! -f "$DEBUG_DUCKDB" ]; then
  echo "Error: Debug DuckDB binary not found at $DEBUG_DUCKDB" >&2
  echo "Please build the extension first: make debug" >&2
  exit 1
fi

if [ ! -x "$DEBUG_DUCKDB" ]; then
  echo "Error: Debug DuckDB binary at $DEBUG_DUCKDB is not executable" >&2
  exit 1
fi

# Get the baseline data for duckdb.
for type_name in functions settings views schemas secret_types types views; do
  "$BASELINE_DUCKDB" -c "COPY (select * from duckdb_${type_name}()) TO '${type_name}-baseline.parquet';"
done

# Now that we have the baseline data, we can get the extension data and diff it.
for type_name in functions settings views schemas secret_types types views; do
  "$DEBUG_DUCKDB" -c "COPY (select * from duckdb_${type_name}()) TO '${type_name}-changed.parquet';"
done

