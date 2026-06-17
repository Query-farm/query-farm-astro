#!/usr/bin/env bash
# Regenerate the vgi-python API reference MDX from Griffe.
# Run from a checkout where `vgi` + `griffe` import (uses the vgi-python venv).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
VGI=/Users/rusty/Development/vgi-python

cd "$VGI"
uv run --with griffe python "$OLDPWD/scripts/gen-api-mdx.py" "$OUT" \
  vgi.scalar_function \
  vgi.table_function \
  vgi.table_in_out_function \
  vgi.table_buffering_function \
  vgi.aggregate_function \
  vgi.worker \
  vgi.client \
  vgi.arguments \
  vgi.catalog \
  vgi.function_storage \
  vgi.metadata \
  vgi.table_filter_pushdown \
  vgi.exceptions \
  vgi.invocation
