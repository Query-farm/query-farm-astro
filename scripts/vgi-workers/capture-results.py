#!/usr/bin/env python3
"""Capture sample results for workers' example queries, for the Orchard worker pages.

The pages show a few rows under each featured example so a visitor sees what a query
returns. Those rows come from here: each worker is attached exactly as the harvest
verified it (``verification.location``, the pinned release) and its catalog examples
are run once. Nothing is typed in by hand, and pages never query anything live; they
read the cached file this writes, ``src/data/vgi-workers/results.generated.json``.

Two steps, because attaching runs on the build box:

    # workstation: pick workers, write the job file
    capture-results.py plan --repos vgi-color,vgi-nba --out job.json
    # build box (haybarn 2.x + the community vgi extension)
    capture-results.py run job.json --out results.json
    # workstation: fold the results into the site's cache
    capture-results.py merge results.json

A worker that needs credentials is skipped (its examples can't run here), and a
query that fails or takes longer than --timeout seconds is recorded as skipped.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import decimal
import json
import multiprocessing as mp
import re
import sys
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
CATALOG = ROOT / "src" / "data" / "vgi-workers" / "catalog.generated.json"
RESULTS = ROOT / "src" / "data" / "vgi-workers" / "results.generated.json"

MAX_ROWS = 5
MAX_CELL = 80  # characters kept per cell
MAX_EXAMPLES = 40


def norm_sql(q: str) -> str:
    """Same normalisation as the site's normSql (index.ts), so pages can look results up."""
    q = q.strip()
    q = re.sub(r";\s*$", "", q)
    return re.sub(r"\s+", " ", q).lower()


# --------------------------------------------------------------------------- plan


def phase_plan(args: argparse.Namespace) -> None:
    doc = json.loads(CATALOG.read_text())
    want = set(args.repos.split(","))
    jobs = []
    for w in doc["workers"]:
        if w["repo"] not in want:
            continue
        v = w.get("verification") or {}
        if not v.get("verified") or not v.get("location"):
            print(f"skip {w['repo']}: not verified", file=sys.stderr)
            continue
        if v.get("needs_credentials"):
            print(f"skip {w['repo']}: examples need credentials", file=sys.stderr)
            continue
        sqls = [e["sql"] for e in (w.get("example_queries") or []) if e.get("sql")][:MAX_EXAMPLES]
        jobs.append({"repo": w["repo"], "catalog": w["catalog"], "location": v["location"], "sql": sqls})
    Path(args.out).write_text(json.dumps(jobs, indent=1))
    print(f"plan: {len(jobs)} workers, {sum(len(j['sql']) for j in jobs)} queries -> {args.out}", file=sys.stderr)


# --------------------------------------------------------------------------- run


def cell(v: Any) -> str | int | float | None:
    """A JSON-safe, display-sized rendering of one value."""
    if v is None or isinstance(v, (bool, int)):
        return v
    if isinstance(v, float):
        return round(v, 6)
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        b = bytes(v)
        s = "\\x" + b[:24].hex() + ("…" if len(b) > 24 else "")
        return f"BLOB {len(b)} bytes: {s}"
    if isinstance(v, (dt.datetime, dt.date, dt.time)):
        return v.isoformat()
    if isinstance(v, (list, tuple, dict)):
        s = json.dumps(v, default=str, ensure_ascii=False)
    else:
        s = str(v)
    return s if len(s) <= MAX_CELL else s[: MAX_CELL - 1] + "…"


def run_chunk(job: dict[str, Any], sqls: list[str], out_path: str) -> None:
    """Attach one worker and run some of its queries; write what came back to out_path."""
    import haybarn as duckdb  # noqa: PLC0415 - only on the build box

    out: dict[str, Any] = {"results": {}, "skipped": {}}

    def save() -> None:
        Path(out_path).write_text(json.dumps(out, ensure_ascii=False))

    try:
        con = duckdb.connect()
        con.sql("INSTALL vgi FROM community; LOAD vgi")
        loc = job["location"].replace("'", "''")
        con.sql(f"ATTACH '{job['catalog']}' AS {job['catalog']} (TYPE vgi, LOCATION '{loc}')")
    except Exception as e:  # noqa: BLE001 - record and move on
        out["error"] = f"attach: {type(e).__name__}: {e}"[:400]
        save()
        return
    for sql in sqls:
        key = norm_sql(sql)
        try:
            rel = con.sql(sql)
            if rel is None:  # a statement with no result set
                out["skipped"][key] = "no result set"
                continue
            rows = rel.limit(MAX_ROWS + 1).fetchall()
            out["results"][key] = {
                "columns": rel.columns,
                "types": [str(t) for t in rel.types],
                "rows": [[cell(v) for v in r] for r in rows[:MAX_ROWS]],
                "more": len(rows) > MAX_ROWS,
            }
        except Exception as e:  # noqa: BLE001
            out["skipped"][key] = f"{type(e).__name__}: {e}"[:300]
        save()  # after every query, so a timed-out chunk still keeps what it got


def phase_run(args: argparse.Namespace) -> None:
    """Every worker at once, each worker's queries split across processes of --chunk queries."""
    jobs = json.loads(Path(args.job).read_text())
    captured_at = dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat()
    tmp = Path(args.out).with_suffix(".parts")
    tmp.mkdir(exist_ok=True)
    procs = []
    for job in jobs:
        for i in range(0, max(1, len(job["sql"])), args.chunk):
            part = tmp / f"{job['repo']}.{i}.json"
            part.unlink(missing_ok=True)
            p = mp.Process(target=run_chunk, args=(job, job["sql"][i : i + args.chunk], str(part)))
            p.start()
            procs.append((job["repo"], p, part))
    print(f"run: {len(procs)} processes for {len(jobs)} workers", file=sys.stderr)
    deadline = dt.datetime.now() + dt.timedelta(seconds=args.timeout * args.chunk)
    for _, p, _ in procs:
        p.join(max(1.0, (deadline - dt.datetime.now()).total_seconds()))
    workers: dict[str, Any] = {}
    for repo, p, part in procs:
        timed_out = p.is_alive()
        if timed_out:
            p.kill()
        w = workers.setdefault(repo, {"results": {}, "skipped": {}})
        if part.exists():
            d = json.loads(part.read_text())
            w["results"].update(d.get("results", {}))
            w["skipped"].update(d.get("skipped", {}))
            if d.get("error"):
                w["error"] = d["error"]
        if timed_out:
            w.setdefault("notes", []).append("a query chunk timed out")
    for job in jobs:
        w = workers[job["repo"]]
        w["location"] = job["location"]
        w["captured_at"] = captured_at
        print(f"{job['repo']}: {len(w['results'])} captured, {len(w['skipped'])} skipped"
              + (f", error: {w['error']}" if w.get("error") else ""), file=sys.stderr)
    Path(args.out).write_text(json.dumps({"captured_at": captured_at, "workers": workers}, indent=1,
                                         ensure_ascii=False))


# --------------------------------------------------------------------------- merge


def phase_merge(args: argparse.Namespace) -> None:
    new = json.loads(Path(args.results).read_text())
    cur = json.loads(RESULTS.read_text()) if RESULTS.exists() else {"workers": {}}
    cur["workers"].update(new["workers"])
    cur["workers"] = dict(sorted(cur["workers"].items()))
    RESULTS.write_text(json.dumps(cur, indent=1, ensure_ascii=False) + "\n")
    print(f"merge: {len(new['workers'])} workers -> {RESULTS} ({len(cur['workers'])} total)", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--repos", required=True, help="comma-separated repo names")
    p.add_argument("--out", required=True)
    p.set_defaults(fn=phase_plan)
    p = sub.add_parser("run")
    p.add_argument("job")
    p.add_argument("--out", required=True)
    p.add_argument("--timeout", type=float, default=60, help="seconds per query (budget)")
    p.add_argument("--chunk", type=int, default=4, help="queries per process")
    p.set_defaults(fn=phase_run)
    p = sub.add_parser("merge")
    p.add_argument("results")
    p.set_defaults(fn=phase_merge)
    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
