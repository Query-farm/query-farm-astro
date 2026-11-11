#!/usr/bin/env python3
"""Harvest the public Query.Farm VGI worker directory into one JSON data file.

Produces ``src/data/vgi-workers/catalog.generated.json`` for the website's
worker directory. Three phases, each runnable on its own:

``inventory`` (needs an authenticated ``gh``)
    Checks ``scripts/vgi-workers/inventory.toml`` against GitHub: every public,
    released, non-archived ``vgi-*`` repo must be under [include] or [exclude].
    Exits non-zero naming any repo that is in neither, so a new worker can't be
    missed. ``github`` runs the same check first.

``github``   (needs an authenticated ``gh``; run on a workstation)
    Takes the [include] workers that are public with a release, and records
    each repo's description/topics, latest release + assets, README, and
    whether it publishes a docker image. Writes ``<work>/github.json`` and the
    attach plan ``<work>/plan.json``.

``catalog``  (needs haybarn 2.x + vgi-lint-check; run on a Linux build box)
    For every worker in the plan, obtains it the way a user would (linux_arm64
    release tarball for Rust/Go/TypeScript, the release jar for Java, ``uv run``
    from a clone for Python), ATTACHes it through the community ``vgi``
    extension, builds vgi-lint-check's ``Catalog`` model and serialises it to
    ``<out>/<repo>.json``. Each worker runs in its own child process with a
    timeout, several at once.

``merge``    (pure Python)
    Joins ``github.json`` + the per-worker catalog files (+ the fleet lint
    report, if present) into the final data file.

``all`` runs the three phases end to end, executing ``catalog`` over ssh::

    scripts/vgi-workers/harvest.py all --remote ec2-user@HOST \
        --remote-env '~/vgi-fleet-20261106/env.sh'

The remote side needs: ``$W/repos/<repo>`` clones (for Python workers), ``uv``,
``java``, ``curl``, and network access to github.com.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import contextlib
import datetime as dt
import json
import os
import re
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path
from typing import Any

ORG = "Query-farm"
HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
DEFAULT_OUT = REPO_ROOT / "src" / "data" / "vgi-workers" / "catalog.generated.json"
DEFAULT_INVENTORY = HERE / "inventory.toml"
DEFAULT_FLEET = Path.home() / "Development" / "vgi-fleet-report" / "fleet.json"
DEFAULT_WORK = Path(tempfile.gettempdir()) / "vgi-workers-harvest"
PLATFORMS = ("linux_amd64", "linux_arm64", "osx_arm64", "osx_amd64", "windows_amd64", "wasm")
SKIP_ASSET_SUFFIXES = (".sha256", ".cosign.bundle", ".sig", ".pem", ".intoto.jsonl", ".sbom.json")
BINARY_LANGS = {"Rust", "Go", "TypeScript"}
LANG_NORMAL = {
    "rust": "Rust",
    "python": "Python",
    "go": "Go",
    "typescript": "TypeScript",
    "ts": "TypeScript",
    "java": "Java",
}


def log(msg: str) -> None:
    print(msg, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------
# Phase 1: GitHub
# --------------------------------------------------------------------------


def load_inventory(path: Path) -> dict[str, Any]:
    """[include] (repo -> options) and [exclude] (repo -> reason) from inventory.toml."""
    import tomllib

    data = tomllib.loads(path.read_text())
    include = data.get("include") or {}
    exclude = data.get("exclude") or {}
    both = sorted(set(include) & set(exclude))
    if both:
        raise SystemExit(f"inventory: in both [include] and [exclude]: {', '.join(both)}")
    return {"include": include, "exclude": exclude}


def list_org_repos() -> list[dict[str, Any]]:
    """Every Query-farm repo with visibility, archive state, language and latest release (one call)."""
    p = subprocess.run(
        ["gh", "repo", "list", ORG, "--limit", "2000", "--json",
         "name,visibility,isArchived,primaryLanguage,latestRelease"],
        capture_output=True, text=True, timeout=300, check=True)
    return json.loads(p.stdout)


def check_inventory(inv: dict[str, Any], repos: list[dict[str, Any]]) -> dict[str, Any]:
    """Classify GitHub's view against the inventory. `listable` rows feed the harvest."""
    by = {r["name"]: r for r in repos}

    def released(r: dict[str, Any]) -> bool:
        return (r.get("visibility") or "").upper() == "PUBLIC" and not r.get("isArchived") \
            and bool(r.get("latestRelease"))

    candidates = sorted(n for n, r in by.items() if n.startswith("vgi-") and released(r))
    unclassified = [n for n in candidates if n not in inv["include"] and n not in inv["exclude"]]
    listable, waiting = [], []
    for repo, opts in sorted(inv["include"].items()):
        r = by.get(repo)
        if r is None:
            waiting.append((repo, "no such repo"))
            continue
        if not released(r):
            why = ("archived" if r.get("isArchived") else
                   "private" if (r.get("visibility") or "").upper() != "PUBLIC" else "no release yet")
            waiting.append((repo, why))
            continue
        lang = (r.get("primaryLanguage") or {}).get("name") or ""
        row = {"repo": repo, "language": LANG_NORMAL.get(lang.lower(), lang),
               "catalog": opts.get("catalog") or repo.removeprefix("vgi-").replace("-", "_")}
        for k in ("script", "run", "location"):
            if opts.get(k):
                row[k] = opts[k]
        listable.append(row)
    stale_excludes = sorted(
        n for n in inv["exclude"]
        if n not in by or (by[n].get("visibility") or "").upper() != "PUBLIC" or by[n].get("isArchived"))
    # Public worker-looking repos with no release yet and not in the file: not an error
    # (they can't be listed), but the likeliest place a forgotten worker hides.
    unreleased = sorted(
        n for n, r in by.items()
        if n.startswith("vgi-") and (r.get("visibility") or "").upper() == "PUBLIC"
        and not r.get("isArchived") and not r.get("latestRelease")
        and n not in inv["include"] and n not in inv["exclude"])
    return {"listable": listable, "waiting": waiting, "unclassified": unclassified,
            "stale_excludes": stale_excludes, "unreleased": unreleased}


def report_inventory(res: dict[str, Any]) -> None:
    log(f"inventory: {len(res['listable'])} workers to harvest")
    if res["waiting"]:
        log("inventory: included but not listable yet: "
            + ", ".join(f"{r} ({why})" for r, why in res["waiting"]))
    if res["stale_excludes"]:
        log("inventory: excluded repos that are no longer public (can be dropped): "
            + ", ".join(res["stale_excludes"]))
    if res["unreleased"]:
        log("inventory: public vgi-* repos with no release, not in inventory.toml (release them to "
            "list them): " + ", ".join(res["unreleased"]))
    if res["unclassified"]:
        log("inventory: UNCLASSIFIED public, released vgi-* repos — add each to [include] or "
            "[exclude] in inventory.toml: " + ", ".join(res["unclassified"]))


def resolve_inventory(args: argparse.Namespace) -> list[dict[str, str]]:
    res = check_inventory(load_inventory(Path(args.inventory)), list_org_repos())
    report_inventory(res)
    if res["unclassified"] and not getattr(args, "allow_unclassified", False):
        raise SystemExit(1)
    return res["listable"]


def phase_inventory(args: argparse.Namespace) -> None:
    rows = resolve_inventory(args)
    if args.json:
        print(json.dumps(rows, indent=1))


def gh_api(path: str, *, raw: bool = False) -> Any:
    cmd = ["gh", "api", path]
    if raw:
        cmd += ["-H", "Accept: application/vnd.github.raw"]
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if p.returncode != 0:
        return None
    return p.stdout if raw else json.loads(p.stdout)


def classify_asset(name: str, language: str) -> str | None:
    """Map a release asset to a platform label; None means 'not a download'."""
    if name.endswith(SKIP_ASSET_SUFFIXES):
        return None
    for plat in PLATFORMS:
        if f"-{plat}." in name or name.endswith(f"-{plat}"):
            return plat
    if name.endswith(".jar"):
        return "jar"
    if name.endswith(".whl"):
        return "wheel"
    if language == "Python" and (name.endswith(".tar.gz") or name.endswith(".zip")):
        return "sdist"
    return "other"


def fetch_github(row: dict[str, str]) -> dict[str, Any]:
    repo = row["repo"]
    info = gh_api(f"repos/{ORG}/{repo}") or {}
    out: dict[str, Any] = {**row, "visibility": (info.get("visibility") or "").lower()}
    if out["visibility"] != "public":
        return out
    out["description"] = info.get("description")
    out["topics"] = info.get("topics") or []
    out["html_url"] = info.get("html_url") or f"https://github.com/{ORG}/{repo}"
    rel = gh_api(f"repos/{ORG}/{repo}/releases/latest")
    if rel:
        assets = []
        for a in rel.get("assets") or []:
            plat = classify_asset(a["name"], row["language"])
            if plat:
                assets.append(
                    {"name": a["name"], "platform": plat, "url": a["browser_download_url"]}
                )
        out["release"] = {
            "tag": rel.get("tag_name"),
            "published_at": rel.get("published_at"),
            "assets": assets,
        }
    else:
        out["release"] = None
    out["readme"] = gh_api(f"repos/{ORG}/{repo}/readme", raw=True)
    wf = gh_api(f"repos/{ORG}/{repo}/contents/.github/workflows") or []
    out["workflows"] = [w.get("name") for w in wf if isinstance(w, dict)]
    return out


def readme_h1(md: str | None) -> str | None:
    for line in (md or "").splitlines():
        m = re.match(r"^#\s+(.+?)\s*#*\s*$", line)
        if m:
            text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", m.group(1))
            text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
            text = re.sub(r"<[^>]+>", "", text).strip(" `*_")
            return text or None
    return None


def readme_first_sql(md: str | None) -> str | None:
    m = re.search(r"^```sql[^\n]*\n(.*?)^```", md or "", re.S | re.M)
    return m.group(1).rstrip("\n") if m else None


def readme_location(md: str | None, catalog: str | None = None) -> str | None:
    """``LOCATION '...'`` of the README's ATTACH for this worker, verbatim.

    Prefers an ATTACH of ``catalog`` (READMEs that compose workers attach a
    sibling first), else the first ATTACH ... LOCATION, else any LOCATION.
    """
    text = md or ""
    pat = r"ATTACH\s+'((?:[^']|'')*)'[^;]*?\bLOCATION\s+'((?:[^']|'')*)'"
    hits = [(m.group(1), m.group(2).replace("''", "'"))
            for m in re.finditer(pat, text, re.S | re.I)]
    if catalog:
        for name, loc in hits:
            if name in (catalog, f"vgi:{catalog}"):
                return loc
    if hits:
        return hits[0][1]
    m = re.search(r"\bLOCATION\s+'((?:[^']|'')*)'", text, re.I)
    return m.group(1).replace("''", "'") if m else None


def build_plan_entry(g: dict[str, Any]) -> dict[str, Any]:
    lang = g["language"]
    rel = g.get("release") or {}
    assets = rel.get("assets") or []
    entry: dict[str, Any] = {
        "repo": g["repo"],
        "language": lang,
        "catalog": g["catalog"],
        "tag": rel.get("tag"),
        "location_example": readme_location(g.get("readme"), g["catalog"]),
    }
    if lang in BINARY_LANGS:
        entry["method"] = "binary"
        entry["asset_url"] = next(
            (a["url"] for a in assets if a["platform"] == "linux_arm64"), None
        )
    elif lang == "Java":
        entry["method"] = "jar"
        entry["asset_url"] = next((a["url"] for a in assets if a["platform"] == "jar"), None)
    else:
        entry["method"] = "uv"
    return entry


def phase_github(args: argparse.Namespace) -> None:
    work = Path(args.work)
    work.mkdir(parents=True, exist_ok=True)
    rows = resolve_inventory(args)
    with cf.ThreadPoolExecutor(12) as ex:
        results = list(ex.map(fetch_github, rows))
    public = [r for r in results if r.get("visibility") == "public"]
    dropped = sorted(r["repo"] for r in results if r.get("visibility") != "public")
    log(f"github: {len(public)} public; not public/missing: {', '.join(dropped)}")
    (work / "github.json").write_text(json.dumps(public, indent=1))
    plan = [build_plan_entry(g) for g in public]
    (work / "plan.json").write_text(json.dumps(plan, indent=1))


# --------------------------------------------------------------------------
# Phase 2: catalog (runs where haybarn + workers can run)
# --------------------------------------------------------------------------


def _download(url: str, dest: Path) -> None:
    subprocess.run(["curl", "-fsSL", "--retry", "3", "-o", str(dest), url], check=True,
                   timeout=600)


def _find_worker_binary(root: Path) -> Path | None:
    exes = []
    for p in root.rglob("*"):
        if p.is_file() and os.access(p, os.X_OK) and not p.name.endswith((".so", ".dylib")):
            exes.append(p)
    if not exes:
        # tar may have lost the mode bits; fall back to any file with 'worker' in it
        exes = [p for p in root.rglob("*") if p.is_file() and "worker" in p.name]
        for p in exes:
            p.chmod(p.stat().st_mode | stat.S_IXUSR)
    if not exes:
        return None
    exes.sort(key=lambda p: ("worker" not in p.name, len(p.parts), p.name))
    return exes[0]


def obtain(spec: dict[str, Any], work: Path, repos: Path) -> tuple[str, Path | None, str]:
    """Fetch the worker; return (LOCATION, cwd, user-facing run command)."""
    method = spec["method"]
    wdir = work / spec["repo"]
    if method in ("binary", "jar"):
        if not spec.get("asset_url"):
            raise RuntimeError(f"no {'linux_arm64 tarball' if method == 'binary' else 'jar'} "
                               f"release asset")
        if wdir.exists():
            shutil.rmtree(wdir)
        wdir.mkdir(parents=True)
        name = spec["asset_url"].rsplit("/", 1)[-1]
        dest = wdir / name
        _download(spec["asset_url"], dest)
        if method == "jar":
            return f"java -jar {dest}", None, f"java -jar {name}"
        xdir = wdir / "x"
        xdir.mkdir()
        with tarfile.open(dest) as tf:
            tf.extractall(xdir, filter="data")
        binp = _find_worker_binary(xdir)
        if binp is None:
            raise RuntimeError("no executable found in release tarball")
        run_cmd = "./" + str(binp.relative_to(xdir))
        if spec.get("container"):
            # The release binary needs a newer glibc than the harvest host has:
            # run the same binary inside a newer-userland container.
            rel = binp.relative_to(xdir)
            loc = (f"docker run --rm -i --memory 4g -v {xdir}:/w:ro {spec['container']} "
                   f"/w/{rel}")
            return loc, None, run_cmd
        return str(binp), None, run_cmd
    # uv: run from the clone with the README's documented command
    clone = repos / spec["repo"]
    if not clone.is_dir():
        raise RuntimeError(f"no clone at {clone}")
    loc = uv_location(spec, clone)
    sync = subprocess.run(["uv", "sync", "--quiet"], cwd=clone, capture_output=True, text=True,
                          timeout=spec.get("sync_timeout", 1200))
    if sync.returncode != 0:
        raise RuntimeError("uv sync failed: " + (sync.stderr.strip().splitlines() or ["?"])[-1])
    # A relative wrapper path (bin/...) must be absolute for the spawned child.
    first = shlex.split(loc)[0]
    if "/" in first and not first.startswith("/"):
        return str(clone / loc), clone, loc
    return loc, clone, loc


def uv_location(spec: dict[str, Any], clone: Path) -> str:
    """The command a user runs from a checkout of a Python worker.

    Prefers the README's ATTACH LOCATION when it is a ``uv`` command; otherwise
    falls back to what the checkout provides (bin/<repo>-worker wrapper, a
    root-level ``*_worker.py``, or a console script named after the repo).
    """
    loc = spec.get("location_example") or ""
    if loc.startswith("uv "):
        return loc
    wrapper = clone / "bin" / f"{spec['repo']}-worker"
    if wrapper.is_file():
        return f"bin/{wrapper.name}"
    scripts = sorted(p.name for p in clone.glob("*_worker.py"))
    if scripts:
        return f"uv run {scripts[0]}"
    pyproject = clone / "pyproject.toml"
    if pyproject.is_file():
        import tomllib

        names = (tomllib.loads(pyproject.read_text()).get("project", {})
                 .get("scripts", {}))
        for cand in (spec["repo"], f"{spec['repo']}-worker"):
            if cand in names:
                return f"uv run {cand}"
    raise RuntimeError(f"no runnable entry point (README LOCATION {loc!r})")


def _decode_tag_value(v: str) -> Any:
    s = (v or "").strip()
    if s[:1] in "[{":
        try:
            return json.loads(s)
        except ValueError:
            return v
    return v


def _tags(ts: Any) -> dict[str, Any]:
    return {k: _decode_tag_value(v) for k, v in sorted(ts.raw.items())}


def _blank(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _exec_sql(ex: Any) -> str:
    parts = []
    for st in ex.statements:
        s = (st.sql or "").strip()
        if s:
            parts.append(s if s.endswith(";") else s + ";")
    return "\n".join(parts)


def _constraint_text(c: Any) -> str | None:
    cols = ", ".join(c.columns)
    t = c.constraint_type
    if t == "NOT NULL":
        return None
    if t == "FOREIGN KEY":
        ref = ", ".join(c.referenced_columns)
        return f"FOREIGN KEY ({cols}) REFERENCES {c.referenced_table}({ref})"
    if t == "CHECK":
        expr = c.expression or ""
        return expr if expr.upper().startswith("CHECK") else f"CHECK ({expr})"
    return f"{t} ({cols})"


def serialize_catalog(cat: Any, con: Any) -> dict[str, Any]:
    """Curated JSON mapping of a vgi-lint-check ``Catalog`` (+ a few extra columns)."""
    from vgi_lint_check.model import TAG_CATEGORIES, TAG_CATEGORY
    from vgi_lint_check.tags import decode_categories, decode_example_queries, parse_keywords

    alias = cat.database

    def q(sql: str) -> list[dict[str, Any]]:
        cur = con.execute(sql, [alias])
        names = [d[0] for d in cur.description]
        return [dict(zip(names, r, strict=False)) for r in cur.fetchall()]

    ret_types: dict[tuple, Any] = {}
    for r in q("SELECT schema_name, function_name, function_type, parameter_types, return_type "
               "FROM duckdb_functions() WHERE database_name = ?"):
        key = (r["schema_name"], r["function_name"], r["function_type"],
               tuple(r["parameter_types"] or []))
        ret_types[key] = r["return_type"]
    nullable: dict[tuple, bool] = {}
    for r in q("SELECT schema_name, table_name, column_name, is_nullable "
               "FROM duckdb_columns() WHERE database_name = ?"):
        nullable[(r["schema_name"], r["table_name"], r["column_name"])] = bool(r["is_nullable"])

    examples: list[dict[str, Any]] = []
    seen_sql: set[str] = set()

    def add_example(title: Any, desc: Any, sql: Any) -> None:
        s = (sql or "").strip()
        if not s:
            return
        key = re.sub(r"\s+", " ", s).rstrip(";").strip()
        if key in seen_sql:
            return
        seen_sql.add(key)
        examples.append({"title": _blank(title), "description": _blank(desc), "sql": s})

    def harvest_examples(eq: list[Any], ex: list[Any]) -> list[str]:
        out = []
        for e in eq:
            raw = e.raw if isinstance(e.raw, dict) else {}
            add_example(raw.get("title") or raw.get("name"), e.description, e.sql)
            if e.sql:
                out.append(e.sql)
        for x in ex:
            sql = _exec_sql(x)
            add_example(x.name, x.description, sql)
            if sql:
                out.append(sql)
        return out

    categories: list[str] = []

    def add_cat(c: str | None) -> None:
        if c and c not in categories:
            categories.append(c)

    cat_eq, _ = decode_example_queries(cat.tags)
    harvest_examples(cat_eq, cat.executable_examples)
    if cat.tags.get(TAG_CATEGORIES):
        for c in decode_categories(cat.tags)[0]:
            add_cat(c.display_title)
    if cat.tags.get(TAG_CATEGORY):
        add_cat(cat.tags.get(TAG_CATEGORY).strip())

    schemas_out = []
    counts = {"tables": 0, "views": 0, "scalar_functions": 0, "table_functions": 0, "macros": 0}
    for s in cat.schemas:
        registry = {c.name: c.display_title for c in s.categories}
        for c in s.categories:
            add_cat(c.display_title)

        def obj_cat(o: Any, registry: dict[str, str] = registry) -> None:
            c = (o.tags.get(TAG_CATEGORY) or "").strip()
            if c:
                add_cat(registry.get(c, c))

        s_eq, _ = decode_example_queries(s.tags)
        harvest_examples(s_eq, s.executable_examples)
        tables_out = []
        for t in [*s.tables, *s.views]:
            obj_cat(t)
            harvest_examples(t.examples, t.executable_examples)
            is_view = t.kind.value == "view"
            counts["views" if is_view else "tables"] += 1
            tables_out.append({
                "name": t.name,
                "kind": "view" if is_view else "table",
                "comment": _blank(t.comment),
                "tags": _tags(t.tags),
                "columns": [
                    {"name": c.name, "type": c.data_type, "comment": _blank(c.comment),
                     "nullable": nullable.get((s.name, t.name, c.name), True)}
                    for c in t.columns
                ],
                "constraints": [x for x in (_constraint_text(c) for c in t.constraints) if x],
            })

        # Group overloads; merge only identical signatures.
        overloads: dict[tuple, int] = {}
        for f in s.functions:
            k = (f.name, f.function_type)
            overloads[k] = overloads.get(k, 0) + 1
        funcs_out: list[dict[str, Any]] = []
        merged: dict[tuple, dict[str, Any]] = {}
        table_names = {t.name for t in s.tables}
        for f in s.functions:
            if f.function_type == "table" and f.name in table_names:
                # The table-function row that backs a VGI table; the table entry has it.
                harvest_examples(f.examples, f.executable_examples)
                continue
            obj_cat(f)
            fn_examples = harvest_examples(f.examples, f.executable_examples)
            if overloads[(f.name, f.function_type)] == 1 and f.arguments:
                arglist = sorted(f.arguments, key=lambda a: (a.field_index is None,
                                                              a.field_index or 0))
                args = [{"name": a.name, "type": a.type, "description": _blank(a.description),
                         "default": _blank(a.default), "named": bool(a.calls_by_name)}
                        for a in arglist]
            else:
                by_name: dict[str, Any] = {}
                for a in f.arguments:
                    by_name.setdefault(a.name, a)
                args = []
                for i, p in enumerate(f.parameters):
                    t = f.parameter_types[i] if i < len(f.parameter_types) else None
                    a = by_name.get(p)
                    args.append({"name": p, "type": t or (a.type if a else None),
                                 "description": _blank(a.description) if a else None,
                                 "default": _blank(a.default) if a else None,
                                 "named": bool(a.calls_by_name) if a else False})
            ft = f.function_type
            if ft == "table":
                kind = "table_in_out" if any(a.is_table_input for a in f.arguments) else "table"
            elif ft in ("scalar", "aggregate", "macro", "table_macro"):
                kind = ft
            else:
                kind = "other"
            sig = (f.name, kind, tuple((a["name"], a["type"]) for a in args))
            if sig in merged:
                ex = merged[sig]
                for e in fn_examples:
                    if e not in ex["examples"]:
                        ex["examples"].append(e)
                continue
            if kind in ("scalar", "aggregate"):
                counts["scalar_functions"] += 1
            elif kind in ("table", "table_in_out"):
                counts["table_functions"] += 1
            elif kind in ("macro", "table_macro"):
                counts["macros"] += 1
            entry = {
                "name": f.name,
                "kind": kind,
                "comment": _blank(f.comment) or _blank(f.description),
                "tags": _tags(f.tags),
                "return_type": ret_types.get(
                    (s.name, f.name, ft, tuple(f.parameter_types))),
                "arguments": args,
                "examples": list(dict.fromkeys(fn_examples)),
            }
            merged[sig] = entry
            funcs_out.append(entry)
        schemas_out.append({
            "name": s.name,
            "comment": _blank(s.comment),
            "tags": _tags(s.tags),
            "tables": tables_out,
            "functions": funcs_out,
        })

    return {
        "catalog": cat.catalog_name,
        "advertised_catalogs": cat.advertised_catalogs,
        "implementation_version": cat.implementation_version,
        "default_schema": cat.default_schema,
        "vgi_version": cat.vgi_version,
        "title": _blank(cat.tags.get("vgi.title")),
        "summary": _blank(cat.comment),
        "doc_md": _blank(cat.description_md),
        "keywords": parse_keywords(cat.tags.get("vgi.keywords")),
        "categories": categories,
        "license": _blank(cat.tags.get("vgi.license")),
        "source_url": _blank(cat.tags.get("vgi.source_url")) or _blank(cat.source_url),
        "catalog_tags": _tags(cat.tags),
        "attach_options": [
            {"name": o.name, "type": o.type, "description": _blank(o.description),
             "required": o.required, "default": o.default}
            for o in cat.attach_options
        ],
        "settings": [
            {"name": st.name, "type": st.input_type, "description": _blank(st.description)}
            for st in cat.settings
        ],
        "example_queries": examples,
        "agent_tasks": [t.prompt for t in cat.agent_test_tasks if t.prompt],
        "schemas": schemas_out,
        "counts": counts,
    }


def phase_catalog_one(args: argparse.Namespace) -> None:
    spec = json.loads(Path(args.spec).read_text())
    out = Path(args.out)
    result: dict[str, Any] = {"repo": spec["repo"], "method": spec["method"], "status": "ok",
                              "error": None}
    try:
        loc, cwd, run_cmd = obtain(spec, Path(args.work), Path(args.repos))
        result["location"] = loc
        result["run_command"] = run_cmd
        if cwd is not None:
            os.chdir(cwd)
        from vgi_lint_check.core import with_attached_catalog

        result["catalog"] = with_attached_catalog(
            loc, serialize_catalog, install=False, spatial=False)
    except BaseException as e:  # noqa: BLE001 - record any failure, never crash the fleet run
        msg = " ".join(str(e).split())
        result["status"] = "attach_failed"
        result["error"] = f"{type(e).__name__}: {msg}"[:600]
    out.write_text(json.dumps(result, indent=1, default=str))


def _avail_gb() -> float | None:
    try:
        for line in Path("/proc/meminfo").read_text().splitlines():
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) / 1024 / 1024
    except OSError:
        return None
    return None


def _wait_for_memory(min_gb: float) -> None:
    """Back off while the host is short of memory (shared build box)."""
    import time

    while (a := _avail_gb()) is not None and a < min_gb:
        log(f"  available memory {a:.1f} GB < {min_gb} GB; waiting")
        time.sleep(30)


def phase_catalog(args: argparse.Namespace) -> None:
    plan = json.loads(Path(args.plan).read_text())
    if args.only:
        wanted = set(args.only.split(","))
        plan = [p for p in plan if p["repo"] in wanted]
    skipped = set(args.skip.split(",")) if args.skip else set()
    outdir = Path(args.out).resolve()
    outdir.mkdir(parents=True, exist_ok=True)
    work = Path(args.work).resolve()
    args.repos = str(Path(args.repos).resolve())
    work.mkdir(parents=True, exist_ok=True)
    # Install the extension once (concurrent FORCE INSTALLs race on the file).
    import haybarn

    con = haybarn.connect()
    con.execute("FORCE INSTALL vgi FROM community")
    con.close()

    def run_one(spec: dict[str, Any]) -> str:
        repo = spec["repo"]
        dest = outdir / f"{repo}.json"
        if args.resume and dest.exists():
            return f"{repo}: cached"
        if repo in skipped:
            dest.write_text(json.dumps({"repo": repo, "method": spec["method"],
                                        "status": "skipped", "error": args.skip_reason}))
            return f"{repo}: skipped"
        _wait_for_memory(args.min_avail_gb)
        specf = work / f"{repo}.spec.json"
        if args.container and spec["method"] == "binary":
            spec = {**spec, "container": args.container}
        specf.write_text(json.dumps(spec))
        cmd = [sys.executable, str(Path(__file__).resolve()), "catalog-one", "--spec",
               str(specf), "--out", str(dest), "--work", str(work), "--repos", args.repos]
        timeout = args.timeout + (args.sync_timeout if spec["method"] == "uv" else 0)
        if args.wrap:
            # e.g. --wrap 'source env.sh; heavy systemd-run --user --scope -p MemoryMax=4G'
            cmd = ["bash", "-c", f"{args.wrap} {shlex.join(cmd)}"]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                start_new_session=True)
        try:
            _, stderr = proc.communicate(timeout=timeout)
            if not dest.exists():
                err = (stderr.strip().splitlines() or [f"child exited {proc.returncode}"])[-1]
                if proc.returncode in (-9, 137):
                    err = f"killed (memory cap?): {err}"
                raise RuntimeError(err)
        except (subprocess.TimeoutExpired, RuntimeError) as e:
            reason = f"timed out after {timeout}s" if isinstance(
                e, subprocess.TimeoutExpired) else str(e)
            with contextlib.suppress(ProcessLookupError):
                os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
            subprocess.run(["pkill", "-9", "-f", str(work / repo)], check=False)
            dest.write_text(json.dumps({"repo": repo, "method": spec["method"],
                                        "status": "attach_failed", "error": reason[:600]}))
        finally:
            if spec["method"] in ("binary", "jar") and not args.keep:
                shutil.rmtree(work / repo, ignore_errors=True)
        st = json.loads(dest.read_text())
        return f"{repo}: {st['status']} {st.get('error') or ''}"

    with cf.ThreadPoolExecutor(args.jobs) as ex:
        for line in ex.map(run_one, plan):
            log(line)


# --------------------------------------------------------------------------
# Phase 3: merge
# --------------------------------------------------------------------------


def load_fleet(path: Path) -> dict[str, dict[str, Any]]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text())
    return {w["name"]: w for w in data.get("workers", [])}


def from_dump(d: dict[str, Any]) -> dict[str, Any]:
    """Adapt a `vgi-lint dump` document (schema_version 1) to the harvest shape."""
    v = d.get("verify") or {}
    lint = d.get("lint") or {}
    return {
        "status": "ok" if d.get("status") in (None, "ok") and d.get("catalog") else d.get("status") or "attach_failed",
        "error": d.get("error"),
        "method": d.get("transport"),
        "location": d.get("location"),
        "catalog": d.get("catalog") or {},
        "secret_types": d.get("secret_types") or [],
        "lint": {"score": lint.get("score"), "level": lint.get("level")} if lint else None,
        "verification": {
            "verified": bool(d.get("verified")),
            "status": v.get("status"),
            "total": v.get("total"),
            "passed": v.get("passed"),
            "failed": v.get("failed"),
            "needs_credentials": v.get("needs_credentials"),
            "location": d.get("location"),
            "transport": d.get("transport"),
            "environment": d.get("environment"),
            "checked_at": d.get("generated_at"),
        },
    }


def run_block(method: Any, run_cmd: Any, loc_example: Any, verified_loc: Any,
              prev: dict[str, Any] | None) -> dict[str, Any]:
    """`command` is the local executable (for manual downloads); the verified
    transport LOCATION goes in `github_auto` / `uvx` / `docker`."""
    prev = prev or {}
    run = {"method": method, "command": prev.get("command") or run_cmd,
           "location_example": loc_example}
    loc = verified_loc or ""
    if loc.startswith("github-auto://"):
        run["github_auto"] = loc
    elif loc.startswith("uvx "):
        run["uvx"] = loc
        run["script"] = loc.rsplit(" ", 1)[-1]
    elif loc.startswith(("docker://", "oci://")):
        run["docker"] = loc
        run["method"] = "docker"
    return run


def merge_worker(g: dict[str, Any], c: dict[str, Any] | None,
                 fleet: dict[str, dict[str, Any]], plan: dict[str, Any]) -> dict[str, Any]:
    repo = g["repo"]
    c = c or {"status": "skipped", "error": "not harvested", "method": plan.get("method")}
    cat = c.get("catalog") or {}
    readme = g.get("readme")
    wf = g.get("workflows") or []
    has_docker = any(n in ("docker-publish.yml", "docker-publish.yaml") for n in wf)
    rel = g.get("release")
    method = plan.get("method")
    loc_example = readme_location(readme, cat.get("catalog") or g["catalog"])
    run_cmd = c.get("run_command")
    if not run_cmd:
        if method == "uv":
            run_cmd = loc_example
        elif method == "jar" and rel:
            run_cmd = f"java -jar {repo}-{rel['tag']}.jar"
        elif method == "binary":
            run_cmd = f"./{repo}-worker"
    fl = fleet.get(repo)
    lint = c.get("lint")
    if lint is None and fl and fl.get("score") is not None:
        lint = {"score": fl.get("score"), "level": fl.get("level_label")}
    empty_counts = {"tables": 0, "views": 0, "scalar_functions": 0, "table_functions": 0,
                    "macros": 0}
    return {
        "slug": repo.removeprefix("vgi-"),
        "repo": repo,
        "repo_url": g.get("html_url") or f"https://github.com/{ORG}/{repo}",
        "catalog": cat.get("catalog") or g["catalog"],
        "language": g["language"],
        "title": cat.get("title") or readme_h1(readme) or repo,
        "tagline": g.get("description"),
        "summary": cat.get("summary"),
        "doc_md": cat.get("doc_md"),
        "keywords": cat.get("keywords") or [],
        "categories": cat.get("categories") or [],
        "topics": g.get("topics") or [],
        "license": cat.get("license"),
        "source_url": cat.get("source_url"),
        "release": rel,
        "image": f"ghcr.io/{ORG.lower()}/{repo}" if has_docker else None,
        "run": run_block(method, run_cmd, loc_example, c.get("location"), plan.get("prev_run")),
        "readme_sql": readme_first_sql(readme),
        "attach_options": cat.get("attach_options") or [],
        "example_queries": cat.get("example_queries") or [],
        "agent_tasks": cat.get("agent_tasks") or [],
        "settings": cat.get("settings") or [],
        "schemas": cat.get("schemas") or [],
        "counts": cat.get("counts") or empty_counts,
        "lint": lint,
        "secret_types": c.get("secret_types") or [],
        "secret_type_details": cat.get("secret_type_details"),
        "verification": c.get("verification"),
        "harvest": {
            "status": c.get("status"),
            "method": c.get("method") or method,
            "error": c.get("error"),
            "vgi_version": cat.get("vgi_version"),
        },
    }


def secret_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize `SELECT * FROM vgi_secret_types()` rows to the dump's shape.

    `vgi-lint dump` (2.2.0+) emits `catalog.secret_type_details` itself when the
    extension has vgi_secret_types(); this reads rows captured separately (e.g.
    with a newer extension build than the harvest ran on).
    """
    out = []
    for r in rows:
        out.append({
            "name": r.get("secret_type") or r.get("name"),
            "description": r.get("description") or None,
            "doc_url": r.get("doc_url") or None,
            "parameters": [
                {k: p.get(k) for k in ("name", "type", "required", "redact", "description")}
                for p in (r.get("parameters") or [])
            ],
            "required_by": list(r.get("required_by") or []),
        })
    return out


def phase_merge(args: argparse.Namespace) -> None:
    work = Path(args.work)
    github = json.loads((work / "github.json").read_text())
    plan = {p["repo"]: p for p in json.loads((work / "plan.json").read_text())}
    catdir = Path(args.catalogs) if args.catalogs else work / "catalogs"
    dumps = Path(args.dumps) if getattr(args, "dumps", None) else None
    fleet = load_fleet(Path(args.fleet))
    secret_dir = Path(args.secret_types) if getattr(args, "secret_types", None) else None
    # Keep executable names found by earlier tarball harvests (the dump only
    # records the transport LOCATION it attached with).
    prev_out = Path(args.out)
    if prev_out.exists():
        for w in json.loads(prev_out.read_text()).get("workers", []):
            if w.get("run", {}).get("method") == "binary" and w["repo"] in plan:
                plan[w["repo"]]["prev_run"] = w["run"]
    workers = []
    for g in sorted(github, key=lambda x: x["repo"]):
        if dumps is not None:
            f = dumps / f"{g['repo']}.json"
            c = from_dump(json.loads(f.read_text())) if f.exists() else None
        else:
            f = catdir / f"{g['repo']}.json"
            c = json.loads(f.read_text()) if f.exists() else None
        if c is not None and secret_dir is not None and not (c.get("catalog") or {}).get(
            "secret_type_details"
        ):
            sf = secret_dir / f"{g['repo']}.json"
            if sf.exists():
                c.setdefault("catalog", {})["secret_type_details"] = secret_rows(
                    json.loads(sf.read_text())
                )
        workers.append(merge_worker(g, c, fleet, plan.get(g["repo"], {})))
    doc = {
        "generated_at": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "workers": workers,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    ok = sum(1 for w in workers if w["harvest"]["status"] == "ok")
    log(f"merge: wrote {out} ({len(workers)} workers, {ok} ok)")


# --------------------------------------------------------------------------
# manifest: user-facing LOCATIONs for `vgi-lint fleet dump`
# --------------------------------------------------------------------------

# Python console scripts that are the bare repo name rather than `<repo>-worker`.


def user_location(g: dict[str, Any]) -> tuple[str, str | None]:
    """The LOCATION a user is told to ATTACH, plus an optional jar URL to fetch first."""
    repo, rel = g["repo"], g.get("release") or {}
    tag = rel.get("tag", "main")
    if g.get("location"):
        return g["location"], None
    if g.get("run") == "docker":
        return f"docker://ghcr.io/{ORG.lower()}/{repo}:{tag.removeprefix('v')}", None
    lang = g["language"]
    if lang == "Python":
        script = g.get("script") or f"{repo}-worker"
        return f"uvx --from git+https://github.com/{ORG}/{repo}@{tag} {script}", None
    if lang == "Java":
        jar = next((a for a in rel.get("assets", []) if a["name"].endswith(".jar")), None)
        if jar:
            return f"java -jar {{jar_dir}}/{jar['name']}", jar["url"]
    return f"github-auto://{ORG}/{repo}@{tag}", None


def phase_manifest(args: argparse.Namespace) -> None:
    work = Path(args.work)
    github = json.loads((work / "github.json").read_text())
    lines = ["# Generated by harvest.py manifest — attach each worker as its README instructs.",
             "[defaults]", f"timeout = {args.timeout}", ""]
    fetch = ["#!/bin/sh", "set -e", f'mkdir -p "{args.jar_dir}"']
    for g in sorted(github, key=lambda x: x["repo"]):
        loc, jar_url = user_location(g)
        loc = loc.replace("{jar_dir}", args.jar_dir)
        if jar_url:
            fetch.append(f'[ -f "{args.jar_dir}/{jar_url.rsplit("/", 1)[1]}" ] || '
                         f'curl -fsSL --retry 3 -o "{args.jar_dir}/{jar_url.rsplit("/", 1)[1]}" {jar_url}')
        lines += ["[[worker]]", f'name = "{g["repo"]}"', f"location = {json.dumps(loc)}", ""]
    out = Path(args.out)
    out.write_text("\n".join(lines))
    (out.parent / "fetch-jars.sh").write_text("\n".join(fetch) + "\n")
    log(f"manifest: wrote {out} and fetch-jars.sh ({len(github)} workers)")


# --------------------------------------------------------------------------
# all: github -> remote catalog over ssh -> merge
# --------------------------------------------------------------------------


def phase_all(args: argparse.Namespace) -> None:
    phase_github(args)
    work = Path(args.work)
    r = args.remote
    rdir = args.remote_dir
    env = f"source {args.remote_env}; " if args.remote_env else ""
    ssh = ["ssh", "-A", "-o", "BatchMode=yes", r]
    subprocess.run([*ssh, f"mkdir -p {rdir}"], check=True)
    subprocess.run(["scp", "-q", __file__, str(work / "plan.json"), f"{r}:{rdir}/"], check=True)
    remote_cmd = (
        f"{env}cd {rdir} && "
        f"uv venv -q --allow-existing .venv && "
        f"uv pip install -q --python .venv/bin/python --prerelease=allow "
        f"'vgi-lint-check>=2.0.1' 'haybarn>=2.0.0rc11' && "
        f".venv/bin/python harvest.py catalog --plan plan.json --out catalogs "
        f"--work work --repos {shlex.quote(args.remote_repos)} --jobs {args.jobs} "
        f"--timeout {args.timeout}"
    )
    subprocess.run([*ssh, remote_cmd], check=True)
    catdir = work / "catalogs"
    if catdir.exists():
        shutil.rmtree(catdir)
    subprocess.run(["scp", "-q", "-r", f"{r}:{rdir}/catalogs", str(work)], check=True)
    args.catalogs = str(catdir)
    phase_merge(args)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--work", default=str(DEFAULT_WORK), help="scratch/cache directory")

    def inventory_args(p: argparse.ArgumentParser) -> None:
        p.add_argument("--inventory", default=str(DEFAULT_INVENTORY))
        p.add_argument("--allow-unclassified", action="store_true",
                       help="warn instead of failing on repos missing from inventory.toml")

    p = sub.add_parser("inventory", help="check inventory.toml against GitHub")
    inventory_args(p)
    p.add_argument("--json", action="store_true", help="print the workers to harvest")
    p.set_defaults(fn=phase_inventory)

    p = sub.add_parser("github")
    common(p)
    inventory_args(p)
    p.set_defaults(fn=phase_github)

    p = sub.add_parser("catalog")
    common(p)
    p.add_argument("--plan", required=True)
    p.add_argument("--out", required=True, help="directory for per-worker JSON")
    p.add_argument("--repos", default=os.path.expandvars("$W/repos"))
    p.add_argument("--jobs", type=int, default=3)
    p.add_argument("--timeout", type=int, default=180)
    p.add_argument("--sync-timeout", type=int, default=1200)
    p.add_argument("--only", help="comma-separated repo names")
    p.add_argument("--resume", action="store_true", help="skip workers already harvested")
    p.add_argument("--keep", action="store_true", help="keep downloaded assets")
    p.add_argument("--min-avail-gb", type=float, default=20.0,
                   help="pause starting workers while MemAvailable is below this")
    p.add_argument("--wrap", help="shell prefix for each worker child (memory cap etc.)")
    p.add_argument("--container", help="run binary workers inside this docker image "
                   "(for release binaries needing a newer glibc than the host)")
    p.add_argument("--skip", help="comma-separated repos to record as skipped")
    p.add_argument("--skip-reason", default="needs large models/data; exceeds harvest memory cap")
    p.set_defaults(fn=phase_catalog)

    p = sub.add_parser("catalog-one")
    common(p)
    p.add_argument("--spec", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--repos", required=True)
    p.set_defaults(fn=phase_catalog_one)

    p = sub.add_parser("merge")
    common(p)
    p.add_argument("--catalogs", help="per-worker catalog dir (default <work>/catalogs)")
    p.add_argument("--dumps", help="directory of `vgi-lint fleet dump` output (preferred: "
                   "adds verification, fresh lint, secret types)")
    p.add_argument("--fleet", default=str(DEFAULT_FLEET))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.add_argument("--secret-types", help="directory of <repo>.json `vgi_secret_types()` rows, "
                   "used when a dump has no secret_type_details")
    p.set_defaults(fn=phase_merge)

    p = sub.add_parser("manifest", help="write a `vgi-lint fleet dump` manifest that attaches each "
                       "worker the way its README tells users to")
    common(p)
    p.add_argument("--out", required=True, help="manifest TOML path")
    p.add_argument("--jar-dir", default="$W/harvest/jars",
                   help="where the box keeps downloaded release jars")
    p.add_argument("--timeout", type=int, default=300)
    p.set_defaults(fn=phase_manifest)

    p = sub.add_parser("all")
    common(p)
    inventory_args(p)
    p.add_argument("--remote", required=True, help="ssh target, e.g. ec2-user@host")
    p.add_argument("--remote-env", help="file to source remotely (sets PATH etc.)")
    p.add_argument("--remote-dir", default="$W/harvest")
    p.add_argument("--remote-repos", default="$W/repos")
    p.add_argument("--jobs", type=int, default=3)
    p.add_argument("--timeout", type=int, default=180)
    p.add_argument("--catalogs", default=None)
    p.add_argument("--fleet", default=str(DEFAULT_FLEET))
    p.add_argument("--out", default=str(DEFAULT_OUT))
    p.set_defaults(fn=phase_all)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
