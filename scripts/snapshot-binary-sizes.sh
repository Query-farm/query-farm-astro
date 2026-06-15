#!/usr/bin/env bash
# Refresh per-platform compiled extension sizes from the Haybarn extension
# repository (haybarn-extensions.query.farm) for every extension.
#
# Thin wrapper over extension-diff-tools/binary-sizes-snapshot.py: it rewrites
# each extension's generated/compatibility.json (platform matrix + DuckDB
# version + binarySizes), all derived from which binaries Haybarn actually
# serves. No credentials needed — the repository is public.
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

if [ "$soft" = 1 ]; then
  extension-diff-tools/binary-sizes-snapshot.py --site . --soft
else
  extension-diff-tools/binary-sizes-snapshot.py --site .
fi
