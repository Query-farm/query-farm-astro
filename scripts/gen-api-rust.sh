#!/usr/bin/env bash
# Regenerate the vgi-rust API reference MDX from rustdoc JSON.
#
# The Rust counterpart of scripts/gen-api-go.sh and scripts/gen-api-ts.sh. Pages
# are topic groups defined in scripts/gen-api-rust/main.py; that file's `GROUPS`
# table is the source of truth for which pages exist, so keep the
# astro.config.mjs sidebar in sync with it.
#
# The generator audits two things and exits non-zero on either:
#   - every module that exports a public documented item belongs to a group, so
#     a new module upstream cannot silently vanish from the reference;
#   - every collected item is rendered.
#
# rustdoc JSON is nightly-only (-Zunstable-options), which is the one build
# requirement the Go and TypeScript generators do not have. The stable toolchain
# still builds and runs the workers; only the docs need nightly.
#
# The public surface spans three crates — `vgi` (the worker framework),
# `vgi-protocol` (the wire types it re-exports, including CacheControl) and
# `vgi-client` — so all three are documented and merged.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
export VGI_RUST="${VGI_RUST:-$HOME/Development/vgi-rust}"

cd "$VGI_RUST"
for crate in vgi vgi-protocol vgi-client; do
  cargo +nightly rustdoc -p "$crate" --lib -- -Zunstable-options --output-format json >/dev/null
done

cd - >/dev/null
python3 scripts/gen-api-rust/main.py "$OUT"
