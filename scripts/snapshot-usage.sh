#!/usr/bin/env bash
# Refresh DuckDB extension load numbers from Cloudflare Analytics Engine.
#
# Thin wrapper over extension-diff-tools/usage-snapshot.py: sources the repo's
# .env for CF_API_TOKEN / CF_ACCOUNT_ID, then rewrites every extension's
# generated/usage.json plus the site-wide src/data/generated/usage-summary.json
# (the extensions-index hero total + 12-week chart).
#
# Usage:
#   scripts/snapshot-usage.sh          # manual: fail loudly if creds/query fail
#   scripts/snapshot-usage.sh --soft   # prebuild: warn and exit 0 on any failure
#
# The committed JSON is the fallback. --soft lets a build proceed offline or in
# CI without Analytics Engine credentials, mirroring fetch-haybarn-versions.mjs.

cd "$(dirname "$0")/.." || exit 1

soft=0
[ "${1:-}" = "--soft" ] && soft=1

# Load CF_API_TOKEN / CF_ACCOUNT_ID from .env if present (absent in CI).
set -a
[ -f ./.env ] && . ./.env
set +a

if extension-diff-tools/usage-snapshot.py --site . --days 90; then
  exit 0
elif [ "$soft" = 1 ]; then
  echo "[snapshot-usage] skipped — no Analytics Engine creds or query failed; using committed load numbers" >&2
  exit 0
else
  exit 1
fi
