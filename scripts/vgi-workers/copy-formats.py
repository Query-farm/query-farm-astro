#!/usr/bin/env python3
"""Harvest the COPY formats each VGI worker registers, for the Orchard worker pages.

A worker can advertise custom `COPY ... FROM` (reader) and `COPY ... TO` (writer)
formats. The extension registers them per attach as `<alias>.<format>` and lists
them in `vgi_copy_formats()`, one row per (format, direction, option). The
`vgi-lint dump` used by harvest.py doesn't record them, so this attaches each
worker from the harvest manifest and reads that table.

    # on the build box (needs haybarn + the vgi extension, like the fleet dump)
    copy-formats.py manifest.toml --out copy-formats.generated.json
    # then copy the file to src/data/vgi-workers/copy-formats.generated.json

Every probed worker is written, so an empty `formats` list means "checked, none".
A worker that fails to attach is written with `error` and no `formats`.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import multiprocessing as mp
import os
import tomllib
from typing import Any


def _sql_str(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def probe(w: dict[str, Any]) -> dict[str, Any]:
    import haybarn as duckdb

    out: dict[str, Any] = {"repo": w["name"]}
    try:
        if w.get("directory"):
            os.chdir(w["directory"])
        con = duckdb.connect()
        con.execute("LOAD vgi")
        loc = w["location"]
        cat = con.execute(f"SELECT * FROM vgi_catalogs({_sql_str(loc)})").fetchall()[0][0]
        opts = "".join(f", {k.replace('-', '_').upper()} {_sql_str(str(v))}"
                       for k, v in (w.get("attach_options") or {}).items())
        con.execute(f'ATTACH {_sql_str(cat)} AS "{cat}" (TYPE vgi, LOCATION {_sql_str(loc)}{opts})')
        rows = con.execute(
            "SELECT format_name, direction, ordered, format_description, format_comment,"
            " format_tags, handler, option_name, option_type, option_description"
            f" FROM vgi_copy_formats() WHERE catalog_name = {_sql_str(cat)}"
        ).fetchall()
    except Exception as e:  # noqa: BLE001 - record and move on
        out["error"] = f"{type(e).__name__}: {e}"[:400]
        return out
    formats: dict[tuple[str, str], dict[str, Any]] = {}
    for name, direction, ordered, desc, comment, tags, handler, oname, otype, odesc in rows:
        # registered as `<alias>.<format>`; keep the advertised name, the page re-scopes it
        short = name.split(".", 1)[1] if name.startswith(cat + ".") else name
        f = formats.setdefault((short, direction), {
            "name": short,
            "direction": direction,
            "ordered": bool(ordered),
            "description": desc or "",
            "comment": comment or "",
            "tags": dict(tags or {}),
            "handler": handler or "",
            "options": [],
        })
        if oname:
            f["options"].append({"name": oname, "type": otype or "", "description": odesc or ""})
    out.update(catalog=cat, formats=list(formats.values()))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("manifest")
    ap.add_argument("--out", required=True)
    ap.add_argument("--jobs", type=int, default=8)
    args = ap.parse_args()
    workers = tomllib.load(open(args.manifest, "rb"))["worker"]
    res: dict[str, Any] = {}
    with mp.Pool(args.jobs) as pool:
        for r in pool.imap_unordered(probe, workers):
            repo = r.pop("repo")
            res[repo] = r
            n = len(r.get("formats", []))
            print(f"{repo}: {n} format(s)" + (f", error: {r['error'][:100]}" if r.get("error") else ""), flush=True)
    doc = {
        "generated_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat(),
        "workers": dict(sorted(res.items())),
    }
    with open(args.out, "w") as fh:
        json.dump(doc, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


if __name__ == "__main__":
    main()
