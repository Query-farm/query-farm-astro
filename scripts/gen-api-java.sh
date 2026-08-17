#!/usr/bin/env bash
# Regenerate the vgi-java API reference MDX from the Java sources.
#
# The Java counterpart of gen-api-go.sh / gen-api-ts.sh / gen-api-rust.sh. Pages
# are topic groups defined in scripts/gen-api-java/main.py; that file's `GROUPS`
# table is the source of truth for which pages exist, so keep the
# astro.config.mjs sidebar in sync with it.
#
# The generator audits two things and exits non-zero on either:
#   - every package declaring a public type belongs to a group (or to
#     SKIP_PACKAGES), so a new package upstream cannot silently vanish;
#   - every collected type is rendered.
#
# It parses the sources directly rather than running javadoc: the standard
# doclet emits a linked HTML site rather than data, so extracting MDX would mean
# either a custom doclet (a Java build step in a JS repo) or scraping HTML. The
# other three generators read declarations for the same reason.
#
# Needs no JDK and no Gradle — only the checkout.
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$PWD/src/content/docs"
export VGI_JAVA="${VGI_JAVA:-$HOME/vgi-java}"

python3 scripts/gen-api-java/main.py "$OUT"
