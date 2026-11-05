#!/usr/bin/env bash
# Refresh per-platform extension availability and sizes from Query.Farm’s
# DuckDB repository and Haybarn’s built-in community repository.
#
# Thin wrapper over extension-diff-tools/binary-sizes-snapshot.py: it rewrites
# each extension's generated/compatibility.json. Checks the current native
# release and the pinned browser release separately. No credentials needed.
#
# Usage:
#   scripts/snapshot-binary-sizes.sh          # manual: fail loudly on error
#   scripts/snapshot-binary-sizes.sh --soft   # prebuild: warn and exit 0 on error
#
# The committed JSON is the fallback. --soft lets a build proceed offline or in
# CI without reaching the network, mirroring snapshot-usage.sh.

cd "$(dirname "$0")/.." || exit 1

soft=0
[ "${1:-}" = "--soft" ] && soft=1

# The snapshot tool runs via `uv` (see its shebang). When uv isn't installed
# (e.g. in CI), check for it first so we skip cleanly instead of letting
# `/usr/bin/env: 'uv': No such file or directory` leak to stderr.
if ! command -v uv >/dev/null 2>&1; then
  if [ "$soft" = 1 ]; then
    echo "[snapshot-binary-sizes] skipped — 'uv' not installed; using committed sizes" >&2
    exit 0
  fi
  echo "[snapshot-binary-sizes] error: 'uv' is required (https://docs.astral.sh/uv/)" >&2
  exit 1
fi

if [ "$soft" = 1 ]; then
  if extension-diff-tools/binary-sizes-snapshot.py --site . --soft; then
    exit 0
  fi
  echo "[snapshot-binary-sizes] skipped — fetch failed; using committed sizes" >&2
  exit 0
else
  extension-diff-tools/binary-sizes-snapshot.py --site .
fi
