#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "duckdb>=1.4",
# ]
# ///
"""
Bake captured query results into augment-authored function examples.

Reads each `<site>/src/data/extensions/<slug>/augment/functions.json`, opens a
DuckDB connection with the extension loaded, runs every example's `code`
against it, and writes back the columns + rows as `outputTable` so the page
shows real captured output next to the SQL.

Idempotent — examples that fail to execute (e.g. reference undefined tables)
are left untouched with a warning. Examples that already have an outputTable
are re-evaluated and the result is overwritten.

Usage:
  bake-examples.py --site <site>          # all extensions
  bake-examples.py --site <site> --slug a5
  bake-examples.py --site <site> --slug geosilo --also-load spatial
"""

import argparse
import json
import sys
from pathlib import Path

import duckdb

# Per-extension extra deps that must be loaded for examples to run. Keep
# minimal — most extensions don't need anything beyond their own LOAD.
EXTRA_DEPS = {
    "geosilo": ["spatial"],
}

# Slugs we never try to bake — they have augment files but aren't real
# community extensions (e.g. our docs reference template).
SKIP_SLUGS = {"example"}


def serialize_value(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (bytes, bytearray)):
        # Hex-encode raw BLOB output so it survives JSON cleanly. Truncate
        # very long blobs (random bytes, etc.) so the table doesn't bloat.
        h = v.hex()
        return h if len(h) <= 200 else h[:200] + '…'
    return str(v)


def execute_example(con, sql: str) -> dict | None:
    """Run `sql` and return {columns, rows} for the result, or None on error /
    no result set (e.g. CREATE TABLE)."""
    try:
        cur = con.execute(sql)
    except Exception as e:
        print(f"    [skip] {e}", file=sys.stderr)
        return None
    if cur.description is None:
        return None
    try:
        rows = cur.fetchall()
    except Exception as e:
        print(f"    [skip] fetch failed: {e}", file=sys.stderr)
        return None
    cols = [{"name": d[0], "align": "left"} for d in cur.description]
    serialized = [[serialize_value(v) for v in row] for row in rows]
    return {"columns": cols, "rows": serialized}


def bake_for_slug(site: Path, slug: str, also_load: list[str]) -> None:
    if slug in SKIP_SLUGS:
        return
    augment_path = site / "src/data/extensions" / slug / "augment/functions.json"
    if not augment_path.exists():
        return  # no augment file — nothing to bake
    entries = json.loads(augment_path.read_text())
    has_examples = any(e.get("examples") for e in entries)
    if not has_examples:
        return

    print(f"\n=== {slug} ===")
    con = duckdb.connect()
    try:
        for ext in also_load:
            con.execute(f"INSTALL {ext}")
            con.execute(f"LOAD {ext}")
        con.execute(f"INSTALL {slug} FROM community")
        con.execute(f"LOAD {slug}")
    except Exception as e:
        print(f"  failed to load extension: {e}", file=sys.stderr)
        con.close()
        return

    baked = 0
    skipped = 0
    untouched = 0
    for entry in entries:
        examples = entry.get("examples")
        if not examples:
            continue
        for ex in examples:
            code = ex.get("code")
            if not code:
                continue
            print(f"  {entry['name']}: {code.splitlines()[0][:80]}")
            output = execute_example(con, code)
            if output is None:
                skipped += 1
                continue
            # Replace outputTable; clear any stale text `output`.
            ex["outputTable"] = output
            if "output" in ex:
                del ex["output"]
            baked += 1

    con.close()
    augment_path.write_text(json.dumps(entries, indent=2) + "\n")
    print(f"  baked={baked}  skipped={skipped}  ({augment_path})")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--site", required=True, type=Path)
    ap.add_argument("--slug", default=None,
                    help="Bake one extension. Omit to bake every extension folder.")
    ap.add_argument("--also-load", action="append", default=[], metavar="EXT",
                    help="Extra extensions to LOAD before the target. Adds to the "
                         "per-extension defaults in EXTRA_DEPS. Repeatable.")
    args = ap.parse_args()

    extensions_dir = args.site / "src/data/extensions"
    if args.slug:
        slugs = [args.slug]
    else:
        slugs = sorted(d.name for d in extensions_dir.iterdir() if d.is_dir())

    for slug in slugs:
        deps = EXTRA_DEPS.get(slug, []) + args.also_load
        bake_for_slug(args.site, slug, deps)


if __name__ == "__main__":
    main()
