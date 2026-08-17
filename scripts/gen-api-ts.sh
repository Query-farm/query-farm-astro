#!/usr/bin/env bash
# Regenerate the vgi-typescript API reference MDX from the TypeScript compiler API.
#
# The TypeScript counterpart of scripts/gen-api-go.sh. Like vgi-go — and unlike
# vgi-python, where a page is a module — vgi-typescript's public surface is one
# barrel (src/index.ts) re-exporting ~390 symbols from ~65 files, so pages are
# topic groups defined in scripts/gen-api-ts/main.ts. That file's `GROUPS` table
# is the source of truth for which pages exist; keep the astro.config.mjs
# sidebar in sync with it.
#
# The generator audits two things and exits non-zero on either:
#   - every src/ file that declares an exported symbol belongs to a group, so a
#     new module upstream cannot silently vanish from the reference;
#   - every exported symbol lands on a page (or is a vgi-rpc re-export, which
#     gets its own page rather than being scattered).
#
# It parses vgi-typescript's source with the `typescript` devDependency of THIS
# repo, not the one in vgi-typescript: that checkout is on TypeScript 7, the Go
# native port, which ships tsc but no JS compiler API.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
VGI_TS="${VGI_TS:-$HOME/Development/vgi-typescript}"

node --experimental-strip-types scripts/gen-api-ts/main.ts "$VGI_TS" "$OUT"
