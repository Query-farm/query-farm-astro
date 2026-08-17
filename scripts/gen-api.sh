#!/usr/bin/env bash
# Regenerate the vgi-python API reference MDX from Griffe.
# Run from a checkout where `vgi` + `griffe` import (uses the vgi-python venv).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
VGI=/Users/rusty/Development/vgi-python

# ALL modules go in ONE invocation. The generator builds its cross-link index
# from the module list it is given, so a module left out of this call is not a
# missing page — it is a page whose `[`Symbol`][]` refs silently render as plain
# text everywhere else. Never regenerate a subset.
cd "$VGI"
uv run --with griffe python "$OLDPWD/scripts/gen-api-mdx.py" "$OUT" \
  vgi.scalar_function \
  vgi.table_function \
  vgi.table_in_out_function \
  vgi.table_buffering_function \
  vgi.aggregate_function \
  vgi.copy_from_function \
  vgi.copy_to_function \
  vgi.worker \
  vgi.serve \
  vgi.client \
  vgi.arguments \
  vgi.catalog \
  vgi.cache_control \
  vgi.function_storage \
  vgi.metadata \
  vgi.table_filter_pushdown \
  vgi.transactor \
  vgi.auth \
  vgi.secret_protocol \
  vgi.secret_service \
  vgi.otel \
  vgi.logging_config \
  vgi.profiling \
  vgi.exceptions \
  vgi.invocation
