#!/usr/bin/env bash
# Regenerate all converted vgi-python MkDocs pages as Starlight MDX.
set -euo pipefail
cd "$(dirname "$0")/.."
SRC=/Users/rusty/Development/vgi-python/docs
D=src/content/docs/vgi/docs/python
conv() { python3 scripts/mkdocs_to_starlight.py "$SRC/$1" "$D/$2" "$3"; }

# how-to guides (source already under how-to/)
conv how-to/catalogs.md                 how-to/catalogs.mdx                 how-to
conv how-to/pushdown-and-statistics.md  how-to/pushdown-and-statistics.mdx  how-to
# NOTE: how-to/state-storage.mdx is hand-authored (expanded "what state is for" +
# the BoundStorage interface). Do not auto-convert it.
conv how-to/index.md                    how-to/index.mdx                    how-to
# NOTE: how-to/serve-http.mdx and how-to/authentication.mdx are hand-authored
# (split apart, and deliberately defer the auth model to vgi-rpc). They have no
# 1:1 MkDocs source here — do not auto-convert http-auth.md / authentication.md.

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
