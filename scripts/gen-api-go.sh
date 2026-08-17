#!/usr/bin/env bash
# Regenerate the vgi-go API reference MDX from go/doc.
#
# The Go counterpart of scripts/gen-api.sh. Unlike Python — where pages are
# modules and the module list lives in that script — vgi-go is a single package,
# so pages are topic groups defined in scripts/gen-api-go/main.go. That file's
# `groups` table is the source of truth for which pages exist; keep the
# astro.config.mjs sidebar in sync with it.
#
# The generator audits two things and exits non-zero on either:
#   - every non-test vgi/*.go file belongs to exactly one group, so a new file
#     upstream cannot silently vanish from the reference;
#   - every documented exported symbol lands on a page.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
VGI_GO="${VGI_GO:-$HOME/Development/vgi-go}"

cd scripts/gen-api-go
go run . -src "$VGI_GO" "$OUT"
