#!/usr/bin/env bash
# Regenerate all converted vgi-python MkDocs pages as Starlight MDX.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=/Users/rusty/Development/vgi-python/docs
D=src/content/docs/vgi/docs/python
conv() { python3 scripts/mkdocs_to_starlight.py "$SRC/$1" "$D/$2" "$3"; }

# NOTE (2026-08-14): how-to/catalogs.mdx, how-to/pushdown-and-statistics.mdx and
# how-to/index.mdx USED to be auto-converted and no longer are. They have since
# been hand-edited here — InfoTips, site lead-ins, and a recipe list that links
# to /how-to/serve-http/ + /how-to/python-app/, which exist only on this site.
# Re-converting them silently reverted all of that and reintroduced a link to
# /how-to/http-auth/, which is a 404 here. Upstream has not touched their
# sources since, so there is nothing to re-import; edit them by hand.
#
# NOTE: how-to/state-storage.mdx is hand-authored (expanded "what state is for" +
# the BoundStorage interface). Do not auto-convert it.
# NOTE: how-to/serve-http.mdx and how-to/authentication.mdx are hand-authored
# (split apart, and deliberately defer the auth model to vgi-rpc). They have no
# 1:1 MkDocs source here — do not auto-convert http-auth.md / authentication.md.

# Pages with a live 1:1 MkDocs source and no site-specific edits.
conv global-functions.md                how-to/global-functions.mdx         how-to

# NOTE: the reference pages (generator-api, aggregate-functions, catalog-interface,
# shared-storage, filter-pushdown, column-statistics, metadata, cli) are now
# hand-authored — real titles/descriptions, trimmed to delegate exhaustive method/
# field tables to the generated API reference, de-duplicated against the how-to
# guides, and given lead-ins. how-to/cli-reference.mdx is new (no MkDocs source).
# Do not auto-convert any of them or the conversion will clobber the edits.

# NOTE: concepts/argument-serialization.mdx is also hand-authored (reframed as
# wire-level reference). concepts/index.mdx and concepts/lifecycle.mdx are
# hand-authored too (D2 diagrams, protocol-stack narrative, function-shape banners).
# Do not re-add any of them here.

echo "converted all vgi-python doc pages"
