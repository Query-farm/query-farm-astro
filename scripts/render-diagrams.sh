#!/usr/bin/env bash
# Render the committed D2 diagram sources to static SVGs under public/.
# Requires the `d2` binary locally (https://d2lang.com). We render to committed SVGs
# rather than building D2 at deploy time, so CI needs no extra binary.
#
# Each src/diagrams/<group>/<name>.d2 renders to
# public/vgi/docs/diagrams/<group>-<name>.svg
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=src/diagrams
OUT=public/vgi/docs/diagrams
mkdir -p "$OUT"

for f in "$SRC"/*/*.d2; do
  group=$(basename "$(dirname "$f")")
  name="$group-$(basename "$f" .d2)"
  d2 --theme=1 --pad=24 --scale=1 "$f" "$OUT/$name.svg"
  chmod 644 "$OUT/$name.svg"
  echo "rendered $OUT/$name.svg"
done
