#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""
Per-extension example/test coverage report.

For each extension, compares the set of functions DuckDB introspection
discovered (`generated/functions.json`) against the set of functions
that appear in *any* SQL we render on the page (function examples,
quickStart, cookbook ```sql blocks, technical-details ```sql blocks).

A function counts as "covered" if its name appears as a `<name>(`
pattern anywhere in any rendered snippet — a deliberately permissive
definition since "shows up in the docs at all" is the bar that
`check-examples.py` actually exercises.

Output:
  - Per-extension table: total functions, covered, uncovered, percent.
  - Per-extension list of uncovered function names (so you know what
    to add an example for).
  - Overall summary across the catalog.

Exit code:
  0 on success (always — coverage is informational, not a gate).

Usage:
    extension-diff-tools/coverage.py
    extension-diff-tools/coverage.py --slug airport
    extension-diff-tools/coverage.py --json     # machine-readable
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXT_DIR = ROOT / "src" / "data" / "extensions"
NON_EXTENSION_SLUGS = {"example", "openprompt"}

CALL_PATTERN = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(")
SQL_FENCE_RE = re.compile(r"```sql\s*\n(.*?)\n```", re.DOTALL)


def collect_introspected_names(slug: str) -> set[str]:
    p = EXT_DIR / slug / "generated" / "functions.json"
    if not p.exists():
        return set()
    try:
        data = json.loads(p.read_text())
    except json.JSONDecodeError:
        return set()
    return {f["name"] for f in data if "name" in f}


def collect_documented_text(slug: str) -> str:
    """Concatenate every piece of authored SQL the page renders."""
    base = EXT_DIR / slug
    chunks: list[str] = []

    # quickStart
    meta = base / "augment" / "metadata.json"
    if meta.exists():
        try:
            d = json.loads(meta.read_text())
            qs = d.get("quickStart")
            if qs:
                chunks.append(qs)
        except json.JSONDecodeError:
            pass

    # functions.json examples + descriptions
    fns = base / "augment" / "functions.json"
    if fns.exists():
        try:
            d = json.loads(fns.read_text())
            if isinstance(d, list):
                for f in d:
                    for ex in f.get("examples") or []:
                        if isinstance(ex, dict) and ex.get("code"):
                            chunks.append(ex["code"])
                    # Descriptions can also reference function names
                    # textually — but those should ideally have working
                    # code in `examples` too. We don't count description
                    # text toward coverage; it's the example code that
                    # `check-examples.py` actually exercises.
        except json.JSONDecodeError:
            pass

    # MDX SQL blocks
    for name in ("cookbook.mdx", "technical-details.mdx"):
        p = base / name
        if p.exists():
            text = p.read_text()
            for m in SQL_FENCE_RE.finditer(text):
                chunks.append(m.group(1))

    return "\n\n".join(chunks)


def covered_in(text: str, names: set[str]) -> set[str]:
    """Return the subset of `names` that appear as `<name>(` in text."""
    seen = {m.group(1) for m in CALL_PATTERN.finditer(text)}
    return {n for n in names if n in seen}


def report_extension(slug: str) -> dict:
    introspected = collect_introspected_names(slug)
    if not introspected:
        return {
            "slug": slug,
            "total": 0,
            "covered": 0,
            "uncovered": [],
            "percent": None,
        }
    text = collect_documented_text(slug)
    covered = covered_in(text, introspected)
    uncovered = sorted(introspected - covered)
    return {
        "slug": slug,
        "total": len(introspected),
        "covered": len(covered),
        "uncovered": uncovered,
        "percent": round(100 * len(covered) / len(introspected), 1) if introspected else None,
    }


def fmt_bar(pct: float | None, width: int = 20) -> str:
    if pct is None:
        return "[" + " " * width + "]   --"
    filled = int(round(pct / 100 * width))
    return "[" + "█" * filled + " " * (width - filled) + f"] {pct:5.1f}%"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", help="Only report this extension")
    ap.add_argument("--json", action="store_true", help="Emit machine-readable JSON")
    ap.add_argument("--full", action="store_true",
                    help="Show every uncovered name (default truncates)")
    args = ap.parse_args()

    if args.slug:
        slugs = [args.slug]
    else:
        slugs = sorted(
            d.name for d in EXT_DIR.iterdir()
            if d.is_dir() and d.name not in NON_EXTENSION_SLUGS
        )

    rows = [report_extension(s) for s in slugs]

    if args.json:
        print(json.dumps(rows, indent=2))
        return

    rows.sort(key=lambda r: (r["percent"] is None, r["percent"] or 0))
    overall_total = sum(r["total"] for r in rows)
    overall_cov = sum(r["covered"] for r in rows)
    overall_pct = round(100 * overall_cov / overall_total, 1) if overall_total else 0

    print(f"{'extension':<22} {'cov / total':<14} {'bar':<31}")
    print("-" * 70)
    for r in rows:
        cov_total = f"{r['covered']:>3} / {r['total']:>3}"
        bar = fmt_bar(r["percent"])
        print(f"{r['slug']:<22} {cov_total:<14} {bar}")
    print("-" * 70)
    print(f"{'OVERALL':<22} {overall_cov:>3} / {overall_total:<6} {fmt_bar(overall_pct)}")
    print()

    # Uncovered details — extensions with the biggest gaps first.
    rows.sort(key=lambda r: -(r["total"] - r["covered"]))
    print("Uncovered functions (extensions with largest gaps first):\n")
    for r in rows:
        if not r["uncovered"]:
            continue
        names = r["uncovered"]
        if not args.full and len(names) > 12:
            shown = names[:12]
            print(f"  [{r['slug']}] {len(names)} uncovered:")
            print("    " + ", ".join(shown) + f", … ({len(names) - 12} more)")
        else:
            print(f"  [{r['slug']}] {len(names)} uncovered:")
            print("    " + ", ".join(names))
    sys.exit(0)


if __name__ == "__main__":
    main()
